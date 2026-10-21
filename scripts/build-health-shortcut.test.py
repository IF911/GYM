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
DOWNLOAD = ROOT / "frontend" / "public" / "shortcuts" / "v2" / "GYM-Health.shortcut"


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
        self.assertEqual(metadata["download"]["file"], "shortcuts/v2/GYM-Health.shortcut")
        self.assertEqual(metadata["download"]["sha256"], hashlib.sha256(DOWNLOAD.read_bytes()).hexdigest())
        self.assertEqual(DOWNLOAD.read_bytes(), SIGNED.read_bytes())

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
        self.assertEqual(log["WFWorkoutDate"]["Value"]["attachmentsByRange"]["{0, 1}"]["OutputName"], "Dates")
        for key, unit in (("WFWorkoutDuration", "min"), ("WFWorkoutCaloriesQuantity", "kcal")):
            value = log[key]["Value"]
            self.assertEqual(value["Unit"], unit)
            self.assertEqual(value["Magnitude"]["OutputName"], "Dictionary Value")

    def test_quantity_fields_resolve_raw_action_outputs_without_an_attachment_envelope(self):
        # Cherri's makeQuantityFieldValue -> variableValueWithSerialization(var, "")
        # writes the raw output token here. The extra envelope imported on iPhone
        # as the red "Unknown Variable" reported on 2026-10-21.
        # https://github.com/electrikmilk/cherri/blob/main/action.go
        # https://github.com/electrikmilk/cherri/blob/main/shortcutgen.go
        producers = {a["WFWorkflowActionParameters"]["UUID"]: a for a in self.actions}
        log = self.actions[self.ids.index("is.workflow.actions.health.workout.log")]["WFWorkflowActionParameters"]
        for field, key in (("WFWorkoutDuration", "minutes"), ("WFWorkoutCaloriesQuantity", "activeKcal")):
            scalar = log[field]["Value"]["Magnitude"]
            self.assertEqual(scalar.get("Type"), "ActionOutput", "quantity imported as Unknown Variable")
            self.assertNotIn("Value", scalar)
            self.assertNotIn("WFSerializationType", scalar)
            producer = producers[scalar["OutputUUID"]]
            self.assertEqual(producer["WFWorkflowActionParameters"]["WFDictionaryKey"], key)
        self.assertNotIn("WFWorkoutDistanceQuantity", log)

    def test_workout_date_uses_an_inline_date_field_token(self):
        # WFDateFieldParameter is a text/date field, rather than a WFInput slot.
        # Compare the native date-field export in aont/c182357d1dad0f6ca2932a54654aa3c1.
        log = self.actions[self.ids.index("is.workflow.actions.health.workout.log")]["WFWorkflowActionParameters"]
        date = log["WFWorkoutDate"]
        self.assertEqual(date["WFSerializationType"], "WFTextTokenString")
        self.assertEqual(date["Value"]["string"], "\ufffc")
        reference = date["Value"]["attachmentsByRange"]["{0, 1}"]
        self.assertEqual(reference["Type"], "ActionOutput")
        producer = next(a for a in self.actions if a["WFWorkflowActionParameters"]["UUID"] == reference["OutputUUID"])
        self.assertEqual(producer["WFWorkflowActionIdentifier"], "is.workflow.actions.detect.date")


if __name__ == "__main__":
    unittest.main()
