from __future__ import annotations

import asyncio
import unittest

from main import ChatRequest, ToolCallRequest, ToolStatus, chat, health
from langgraph_demo import run_research_graph


class FastApiTeachingServiceTests(unittest.TestCase):
    def test_health(self) -> None:
        self.assertEqual(asyncio.run(health()), {"ok": True})

    def test_side_effect_tool_waits_for_confirmation(self) -> None:
        request = ChatRequest(
            message="退款超过三天怎么办？",
            tool_calls=[
                ToolCallRequest(
                    name="refund.preview",
                    arguments={
                        "ticket_id": "T-1002",
                        "amount": 99,
                        "idempotency_key": "test-refund",
                    },
                )
            ],
        )
        response = asyncio.run(chat(request))
        self.assertEqual(
            response.tool_results[0].status,
            ToolStatus.PENDING_CONFIRMATION,
        )

    def test_langgraph_state_and_checkpoint_demo(self) -> None:
        result = run_research_graph("退款超过三天怎么办？")
        self.assertEqual(len(result["plan"]), 4)
        self.assertIn("退款审核规则", result["answer"])


if __name__ == "__main__":
    unittest.main()
