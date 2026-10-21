#!/usr/bin/env python3
"""Build the generic, data-free GYM -> Apple Health Shortcut.

The action identifiers and Log Workout field names are taken from the public
HealthKit Shortcuts reference used by the project.  This script never runs a
Shortcut and never embeds a workout or Health sample.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import plistlib
import subprocess
import shutil
import tempfile
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
SOURCE = PUBLIC / "GYM-Health.shortcut.plist"
SIGNED = PUBLIC / "GYM-Health.shortcut"
INTEGRITY = PUBLIC / "GYM-Health.integrity.json"

ACTION_GET_DICT = "is.workflow.actions.detect.dictionary"
ACTION_GET_VALUE = "is.workflow.actions.getvalueforkey"
ACTION_LOG_WORKOUT = "is.workflow.actions.health.workout.log"


def token(output_uuid: str, output_name: str = "Dictionary Value") -> dict:
    return {
        "Value": {
            "OutputName": output_name,
            "OutputUUID": output_uuid,
            "Type": "ActionOutput",
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }


def quantity(output_uuid: str, unit: str) -> dict:
    return {
        # The documented WFQuantityFieldValue shape keeps Magnitude and Unit
        # inside Value. Magnitude is connected to the dictionary value.
        "Value": {"Magnitude": token(output_uuid, "Dictionary Value"), "Unit": unit},
        "WFSerializationType": "WFQuantityFieldValue",
    }


def action(identifier: str, params: dict | None = None, action_uuid: str | None = None) -> dict:
    p = {"UUID": action_uuid or str(uuid.uuid4()).upper()}
    if params:
        p.update(params)
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": p}


def build() -> dict:
    # UUIDs are deliberately deterministic: the output is byte-for-byte stable.
    get_dict_uuid = "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E001"
    start_uuid = "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E002"
    date_uuid = "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E007"
    minutes_uuid = "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E003"
    kcal_uuid = "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E004"
    log_uuid = "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E006"
    if_group = "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E010"

    def get_value(key: str, out_uuid: str) -> dict:
        return action(
            ACTION_GET_VALUE,
            {
                "WFDictionaryKey": key,
                "WFInput": token(get_dict_uuid, "Dictionary"),
            },
            out_uuid,
        )

    def conditional_input() -> dict:
        return {
            "Type": "Variable",
            "Variable": token(get_dict_uuid, "Dictionary"),
        }

    return {
        "WFWorkflowClientRelease": "26A0000a",
        "WFWorkflowClientVersion": "2700.0.4",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 59713, "WFWorkflowIconStartColor": 4282601983},
        "WFWorkflowImportQuestions": [],
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem", "WFDictionaryContentItem"],
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowName": "GYM-Health",
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowActions": [
            action(
                "is.workflow.actions.comment",
                {"WFCommentActionText": "GYM JSON input: version, id, start, end, minutes, activeKcal. Processing is on device; Health may sync via Apple settings."},
                "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E000",
            ),
            action(
                ACTION_GET_DICT,
                {"WFInput": {"Value": {"Type": "ExtensionInput"}, "WFSerializationType": "WFTextTokenAttachment"}},
                get_dict_uuid,
            ),
            action(
                "is.workflow.actions.conditional",
                {
                    "GroupingIdentifier": if_group,
                    "WFControlFlowMode": 0,
                    "WFCondition": 100,
                    "WFInput": conditional_input(),
                },
                "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E011",
            ),
            get_value("start", start_uuid),
            action(
                "is.workflow.actions.detect.date",
                {"WFInput": token(start_uuid, "Dictionary Value")},
                date_uuid,
            ),
            get_value("minutes", minutes_uuid),
            get_value("activeKcal", kcal_uuid),
            action(
                "is.workflow.actions.alert",
                {
                    "WFAlertActionMessage": "Добавить силовую тренировку из GYM в «Здоровье»? Калории рассчитаны приблизительно. Если эту тренировку уже записали часы или другое приложение, нажми «Отмена», чтобы не создать дубликат.",
                    "WFAlertActionCancelButtonShown": True,
                },
                "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E015",
            ),
            action(
                ACTION_LOG_WORKOUT,
                {
                    # Health's picker is an enum. Keep this fixed so an
                    # absent/unknown payload cannot select an arbitrary type.
                    "WFWorkoutReadableActivityType": "Traditional Strength Training",
                    "WFWorkoutDate": token(date_uuid, "Dates"),
                    "WFWorkoutDuration": quantity(minutes_uuid, "min"),
                    "WFWorkoutCaloriesQuantity": quantity(kcal_uuid, "kcal"),
                },
                log_uuid,
            ),
            action(
                "is.workflow.actions.conditional",
                {"GroupingIdentifier": if_group, "WFControlFlowMode": 1},
                "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E012",
            ),
            action(
                "is.workflow.actions.alert",
                {"WFAlertActionMessage": "GYM Health: pass a workout JSON object as Shortcut Input."},
                "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E013",
            ),
            action(
                "is.workflow.actions.conditional",
                {"GroupingIdentifier": if_group, "WFControlFlowMode": 2},
                "2B72D0A8-24A6-4C5B-8E12-2C7AC0B7E014",
            ),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-sign", action="store_true")
    args = parser.parse_args()
    data = build()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    # shortcuts sign accepts the native binary plist container. The file is
    # still a normal inspectable plist (`plutil -p`/`plutil -lint`).
    SOURCE.write_bytes(plistlib.dumps(data, fmt=plistlib.FMT_BINARY, sort_keys=False))
    if not args.no_sign:
        with tempfile.TemporaryDirectory(prefix="gym-health-sign-") as tmp:
            unsigned = Path(tmp) / "GYM-Health.unsigned.shortcut"
            shutil.copyfile(SOURCE, unsigned)
            subprocess.run(["/usr/bin/shortcuts", "sign", "--mode", "anyone", "--input", str(unsigned), "--output", str(SIGNED)], check=True)
        metadata = {
            "source": {"file": SOURCE.name, "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest()},
            "signed": {"file": SIGNED.name, "sha256": hashlib.sha256(SIGNED.read_bytes()).hexdigest()},
        }
        INTEGRITY.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {SOURCE}")
    if not args.no_sign:
        print(f"signed {SIGNED}")


if __name__ == "__main__":
    main()
