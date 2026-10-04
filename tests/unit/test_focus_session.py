"""Unit tests for FocusSessionManager and DeepWorkBank."""
import pytest

from standalone_agent.focus_session import DeepWorkBank, FocusSessionManager


@pytest.fixture
def manager() -> FocusSessionManager:
    return FocusSessionManager()


def test_focus_session_start_and_end(manager: FocusSessionManager) -> None:
    session = manager.start_session("usr_marcus_01", duration_minutes=25)
    assert session.user_id == "usr_marcus_01"
    assert session.status == "active"
    assert session.duration_minutes == 25

    end_res = manager.end_session(session.session_id)
    assert end_res["status"] == "completed"
    assert end_res["session_id"] == session.session_id


def test_explicit_self_report_distraction(manager: FocusSessionManager) -> None:
    session = manager.start_session("usr_marcus_01", duration_minutes=25)
    res = manager.report_distraction(session.session_id)

    assert res["is_distracted"] is True
    assert res["distraction_score"] >= 0.80
    assert "You reported being distracted." in res["reasons"]
    assert res["bank_delta"] == -1
    assert res["recommended_action"] == "request_pause"


def test_optional_signals_disabled_until_consent(manager: FocusSessionManager) -> None:
    session = manager.start_session("usr_marcus_01", duration_minutes=25)

    # 1. Unconsented optional signal is strictly ignored
    res_unconsented = manager.process_optional_signal(session.session_id, "allowed_video_noise")
    assert res_unconsented["status"] == "ignored_unconsented"
    assert session.distraction_score == 0.0

    # 2. Grant explicit consent for optional signal
    manager.set_signal_consent("usr_marcus_01", "allowed_video_noise", consented=True)
    assert manager.is_signal_consented("usr_marcus_01", "allowed_video_noise") is True

    # 3. Now signal is processed
    res_consented = manager.process_optional_signal(session.session_id, "allowed_video_noise")
    assert res_consented["status"] == "processed"
    assert res_consented["distraction_score"] == 0.25


def test_deep_work_bank_privacy_and_bounds() -> None:
    bank = DeepWorkBank(user_id="usr_marcus_01", balance=10)

    # Delta bounded between [-10, 10]
    tx_huge = bank.record_points(session_id="sess_1", delta=50, reason="Massive bonus")
    assert tx_huge.delta == 10
    assert bank.balance == 20

    tx_penalty = bank.record_points(session_id="sess_2", delta=-5, reason="Distraction penalty")
    assert tx_penalty.delta == -5
    assert bank.balance == 15

    # Export private history
    summary = bank.export_private_history()
    assert summary["private_only"] is True
    assert summary["team_sharing_enabled"] is False
    assert summary["employer_reporting"] == "STRICTLY_PROHIBITED"
    assert len(summary["recent_transactions"]) == 2
