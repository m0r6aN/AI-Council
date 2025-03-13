import unittest
from backend.app.agents.grok.grok_agent import DebateStateMachine

class TestDebateStateMachine(unittest.TestCase):
    def setUp(self):
        self.state_machine = DebateStateMachine(redis_client=None)

    def test_state_transition(self):
        self.assertEqual(self.state_machine.current_state(), "propose")
        self.state_machine.next_turn("Test message")
        self.assertEqual(self.state_machine.current_state(), "critique")

    def test_speaker_rotation(self):
        self.assertEqual(self.state_machine.current_speaker(), "Grok")
        self.state_machine.next_turn("Test message")
        self.assertEqual(self.state_machine.current_speaker(), "Claude")