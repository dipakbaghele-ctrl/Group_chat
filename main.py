import os
from fastapi import FastAPI, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import socketio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from models import Base
import crud, schemas

# CONFIG 
DATABASE_URL = "postgresql+asyncpg://dipakbaghele:Password%40123@localhost:5432/chatdb"
UPLOAD_FOLDER = "./uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

#  DATABASE 
engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# FASTAPI APP 
fastapi_app = FastAPI()

# CORS
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static folder
fastapi_app.mount("/static", StaticFiles(directory="static"), name="static")
# fastapi_app.mount("/", StaticFiles(directory="static", html=True), name="static")

# Serve HTML at root
@fastapi_app.get("/")
async def get_index():
    return FileResponse(os.path.join("static", "index.html"))

# Initialize DB
@fastapi_app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@fastapi_app.post("/rooms/")
async def create_room(room: schemas.RoomCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create_room(db, room.name)

@fastapi_app.get("/rooms/{room_id}/messages/")
async def get_messages(room_id: int, skip: int = 0, limit: int = 20, db: AsyncSession = Depends(get_db)):
    return await crud.get_messages(db, room_id, skip, limit)

@fastapi_app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(file_path, "wb") as f:
        f.write(await file.read())
    return {"filename": file.filename, "url": f"/uploads/{file.filename}"}

# Code for Connections SOCKET.IO 
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

@sio.event
async def connect(sid, environ):
    print("Client connected:", sid)

@sio.event
async def disconnect(sid):
    print("Client disconnected:", sid)

@sio.event
async def join_room(sid, data):
    room = data['room']
    sio.enter_room(sid, room)
    await sio.emit("notification", {"msg": f"{data['user']} joined {room}"}, room=room)

@sio.event
async def leave_room(sid, data):
    room = data['room']
    sio.leave_room(sid, room)
    await sio.emit("notification", {"msg": f"{data['user']} left {room}"}, room=room)

@sio.event
async def send_message(sid, data):
    room = data['room']
    sender = data['sender']
    content = data['content']
    content_type = data.get("content_type", "text")
    # Save to DB
    async for db in get_db():
        await crud.create_message(db, sender, data['room_id'], content, content_type)
    await sio.emit("receive_message", data, room=room)

# WRAP FASTAPI WITH SOCKET.IO 
app = socketio.ASGIApp(sio, fastapi_app)
