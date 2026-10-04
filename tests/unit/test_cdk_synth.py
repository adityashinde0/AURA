"""Unit tests verifying AWS CDK synthesis and CloudFormation resource contracts."""
from __future__ import annotations

import json
from pathlib import Path
import pytest

TEMPLATE_PATH = Path(__file__).resolve().parent.parent.parent / "infra" / "cdk.out" / "AuraCloudIntakeStack.template.json"


@pytest.fixture(scope="module")
def cf_template() -> dict:
    if not TEMPLATE_PATH.exists():
        pytest.skip("CDK template not yet synthesized. Run 'cdk synth' in infra/.")
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_kms_key_present(cf_template: dict) -> None:
    resources = cf_template.get("Resources", {})
    kms_keys = [k for k, v in resources.items() if v.get("Type") == "AWS::KMS::Key"]
    assert len(kms_keys) >= 1
    key_props = resources[kms_keys[0]]["Properties"]
    assert key_props.get("EnableKeyRotation") is True


def test_dynamodb_tables_present(cf_template: dict) -> None:
    resources = cf_template.get("Resources", {})
    tables = [v for v in resources.values() if v.get("Type") == "AWS::DynamoDB::Table"]
    assert len(tables) >= 2
    table_names = {t["Properties"].get("TableName") for t in tables}
    assert "AuraCoreTable" in table_names
    assert "AuraWebSocketConnections" in table_names


def test_sqs_queues_and_dlq_present(cf_template: dict) -> None:
    resources = cf_template.get("Resources", {})
    queues = [v for v in resources.values() if v.get("Type") == "AWS::SQS::Queue"]
    queue_names = {q["Properties"].get("QueueName") for q in queues}
    assert "aura-intake-queue" in queue_names
    assert "aura-intake-dlq" in queue_names
    assert "aura-eventbridge-dlq" in queue_names


def test_eventbridge_bus_and_rules_present(cf_template: dict) -> None:
    resources = cf_template.get("Resources", {})
    buses = [v for v in resources.values() if v.get("Type") == "AWS::Events::EventBus"]
    assert len(buses) >= 1
    assert buses[0]["Properties"]["Name"] == "aura-event-bus"

    rules = [v for v in resources.values() if v.get("Type") == "AWS::Events::Rule"]
    rule_names = {r["Properties"].get("Name") for r in rules}
    assert "aura-focus-signal-rule" in rule_names
    assert "aura-meeting-prep-rule" in rule_names


def test_lambda_functions_present(cf_template: dict) -> None:
    resources = cf_template.get("Resources", {})
    lambdas = [v for v in resources.values() if v.get("Type") == "AWS::Lambda::Function"]
    fn_names = {l["Properties"].get("FunctionName") for l in lambdas}
    assert "aura-focus-guardian" in fn_names
    assert "aura-ws-connect-handler" in fn_names
    assert "aura-ws-relay-handler" in fn_names
    assert "aura-control-plane" in fn_names


def test_api_gateway_apis_present(cf_template: dict) -> None:
    resources = cf_template.get("Resources", {})
    apis = [v for v in resources.values() if v.get("Type") == "AWS::ApiGatewayV2::Api"]
    protocols = {a["Properties"].get("ProtocolType") for a in apis}
    assert "WEBSOCKET" in protocols
    assert "HTTP" in protocols


def test_waf_web_acl_present(cf_template: dict) -> None:
    resources = cf_template.get("Resources", {})
    acls = [v for v in resources.values() if v.get("Type") == "AWS::WAFv2::WebACL"]
    assert len(acls) >= 1
    rules = acls[0]["Properties"]["Rules"]
    rule_names = {r["Name"] for r in rules}
    assert "AWS-AWSManagedRulesCommonRuleSet" in rule_names
    assert "AWS-AWSManagedRulesKnownBadInputsRuleSet" in rule_names
    assert "RateLimit500Per5Min" in rule_names
