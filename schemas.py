from pydantic import BaseModel

class RoomCreate(BaseModel):
    name: str

class MessageCreate(BaseModel):
    room_id: int
    sender: str
    content: str
    content_type: str
