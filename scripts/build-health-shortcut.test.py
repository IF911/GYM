import plistlib
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build-health-shortcut.py"
SOURCE = ROOT / "frontend" / "public" / "GYM-Health.shortcut.plist"
SIGNED = ROOT / "frontend" / "public" / "GYM-Health.shortcut"
INTEGRITY = ROOT / "frontend" / "public" / "GYM-Health.integrity.json"


class HealthShortcutArtifactTest(unittest.TestCase):
    def setUp(self):
        subprocess.run([sys.executable, str(SCRIPT), "--no-sign"], check=True)
        self.data = plistlib.loads(SOURCE.read_bytes())
        self.actions = self.data["WFWorkflowActions"]
        self.ids = [a["WFWorkflowActionIdentifier"] for a in self.actions]

    def test_source_is_deterministic_and_named_for_public_download(self):
        first = SOURCE.read_bytes()
        subprocess.run([sys.executable, str(SCRIPT), "--no-sign"], check=True)
        self.assertEqual(first, SOURCE.read_bytes())
        self.assertEqual(self.data["WFWorkflowName"], "GYM-Health")
        self.assertEqual(SIGNED.name, "GYM-Health.shortcut")
        self.assertNotIn(b"gym-", first)

    def test_integrity_metadata_matches_source_and_signed_artifact(self):
        metadata = json.loads(INTEGRITY.read_text(encoding="utf-8"))
        self.assertEqual(metadata["source"]["file"], SOURCE.name)
        self.assertEqual(metadata["signed"]["file"], SIGNED.name)
        self.assertEqual(metadata["source"]["sha256"], hashlib.sha256(SOURCE.read_bytes()).hexdigest())
        self.assertEqual(metadata["signed"]["sha256"], hashlib.sha256(SIGNED.read_bytes()).hexdigest())
        self.assertEqual(SIGNED.read_bytes()[:4], b"AEA1")

    def test_health_chain_and_explicit_input(self):
        self.assertEqual(self.ids[1], "is.workflow.actions.detect.dictionary")
        self.assertIn("is.workflow.actions.detect.date", self.ids)
        self.assertIn("is.workflow.actions.health.workout.log", self.ids)
        get_dict = self.actions[1]["WFWorkflowActionParameters"]["WFInput"]
        self.assertEqual(get_dict["Value"]["Type"], "ExtensionInput")

    def test_guard_confirmation_and_no_network_or_cloud_actions(self):
        self.assertEqual(self.ids.count("is.workflow.actions.conditional"), 3)
        guard = self.actions[2]["WFWorkflowActionParameters"]
        self.assertEqual(guard["WFCondition"], 100)
        log_index = self.ids.index("is.workflow.actions.health.workout.log")
        confirm = self.actions[log_index - 1]["WFWorkflowActionParameters"]
        self.assertTrue(confirm["WFAlertActionCancelButtonShown"])
        self.assertIn("дубликат", confirm["WFAlertActionMessage"])
        forbidden = ("getcontents", "request", "url", "clipboard", "icloud", "share")
        self.assertFalse(any(any(part in ident.lower() for part in forbidden) for ident in self.ids))

    def test_dynamic_health_fields_are_wired_to_dictionary_values(self):
        log = self.actions[self.ids.index("is.workflow.actions.health.workout.log")]["WFWorkflowActionParameters"]
        self.assertEqual(log["WFWorkoutReadableActivityType"], "Traditional Strength Training")
        self.assertEqual(log["WFWorkoutDate"]["Value"]["OutputName"], "Dates")
        for key, unit in (("WFWorkoutDuration", "min"), ("WFWorkoutCaloriesQuantity", "kcal")):
            value = log[key]["Value"]
            self.assertEqual(value["Unit"], unit)
            self.assertEqual(value["Magnitude"]["Value"]["OutputName"], "Dictionary Value")


if __name__ == "__main__":
    unittest.main()
