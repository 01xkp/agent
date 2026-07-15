from __future__ import annotations

from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph


class ResearchState(TypedDict):
    answer: str
    plan: list[str]
    question: str
    sources: list[str]


def plan_node(state: ResearchState) -> ResearchState:
    return {
        **state,
        "plan": ["权限检查", "知识库检索", "工具判断", "带引用回答"],
    }


def retrieve_node(state: ResearchState) -> ResearchState:
    sources = (
        ["退款审核规则"]
        if "退款" in state["question"]
        else ["登录验证码处理"]
    )
    return {**state, "sources": sources}


def answer_node(state: ResearchState) -> ResearchState:
    sources = "、".join(state["sources"])
    return {
        **state,
        "answer": f"已按计划处理“{state['question']}”，引用：{sources}。",
    }


def build_research_graph():
    builder = StateGraph(ResearchState)
    builder.add_node("plan", plan_node)
    builder.add_node("retrieve", retrieve_node)
    builder.add_node("answer", answer_node)
    builder.add_edge(START, "plan")
    builder.add_edge("plan", "retrieve")
    builder.add_edge("retrieve", "answer")
    builder.add_edge("answer", END)
    return builder.compile(checkpointer=InMemorySaver())


def run_research_graph(question: str) -> ResearchState:
    graph = build_research_graph()
    result = graph.invoke(
        {"question": question, "plan": [], "sources": [], "answer": ""},
        config={"configurable": {"thread_id": "week-5-demo"}},
    )
    return ResearchState(**result)
