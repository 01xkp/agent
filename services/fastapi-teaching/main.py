from __future__ import annotations

import asyncio
from enum import Enum
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


class ToolStatus(str, Enum):
    SUCCESS = "success"
    PENDING_CONFIRMATION = "pending_confirmation"


class ToolCallRequest(BaseModel):
    name: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)
    approved: bool = False


class ToolCallResult(BaseModel):
    call_id: str
    status: ToolStatus
    result: dict[str, Any]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    tool_calls: list[ToolCallRequest] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    tool_results: list[ToolCallResult]


app = FastAPI(title="CS 凡 Week 2 FastAPI 教学服务", version="0.1.0")


async def run_tool(call: ToolCallRequest) -> ToolCallResult:
    await asyncio.sleep(0.01)
    if call.name == "ticket.lookup":
        ticket_id = str(call.arguments.get("ticket_id", "T-1001"))
        return ToolCallResult(
            call_id=str(uuid4()),
            status=ToolStatus.SUCCESS,
            result={"ticket_id": ticket_id, "summary": "验证码失败可先清理缓存"},
        )

    if call.name == "refund.preview":
        if not call.approved:
            return ToolCallResult(
                call_id=str(uuid4()),
                status=ToolStatus.PENDING_CONFIRMATION,
                result={"reason": "退款属于高风险副作用动作，需要人工确认"},
            )
        return ToolCallResult(
            call_id=str(uuid4()),
            status=ToolStatus.SUCCESS,
            result={
                "ticket_id": call.arguments.get("ticket_id", "T-1002"),
                "amount": call.arguments.get("amount", 0),
                "idempotency_key": call.arguments.get("idempotency_key"),
            },
        )

    raise HTTPException(status_code=400, detail=f"未知工具：{call.name}")


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    tool_results = [await run_tool(call) for call in request.tool_calls]
    pending = any(
        result.status == ToolStatus.PENDING_CONFIRMATION for result in tool_results
    )
    suffix = "有工具等待人工确认。" if pending else "工具调用已完成。"
    return ChatResponse(
        answer=f"收到：{request.message}。{suffix}",
        tool_results=tool_results,
    )
