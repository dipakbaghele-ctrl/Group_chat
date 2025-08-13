from sqlalchemy.future import select
from models import Room, Message
from sqlalchemy.ext.asyncio import AsyncSession

async def create_room(db: AsyncSession, name: str):
    room = Room(name=name)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room

async def create_message(db: AsyncSession, sender, room_id, content, content_type):
    message = Message(sender=sender, room_id=room_id, content=content, content_type=content_type)
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message

async def get_messages(db: AsyncSession, room_id: int, skip=0, limit=20):
    result = await db.execute(select(Message).where(Message.room_id==room_id).offset(skip).limit(limit))
    return result.scalars().all()
