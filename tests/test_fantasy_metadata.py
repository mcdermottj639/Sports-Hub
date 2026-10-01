"""Regression tests for the metadata omitted by espn-api Player objects."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('fantasy_server', Path(__file__).parents[1] / 'server/main.py')
server = importlib.util.module_from_spec(spec)
with patch('threading.Thread.start'):
    spec.loader.exec_module(server)


class MetadataTests(unittest.TestCase):
    def test_status_and_timestamp(self):
        self.assertEqual(server.acquisition_fields({'status': 'FREEAGENT'})['acquisitionState'], 'free_agent')
        got = server.acquisition_fields({'status': 'WAIVERS', 'waiverProcessDate': 1791010800000})
        self.assertEqual(got, {'acquisitionState': 'waivers', 'waiverClearsAt': '2026-10-03T07:00:00+00:00'})
        self.assertIsNone(server.acquisition_fields({'status': 'UNKNOWN'})['acquisitionState'])
        self.assertIsNone(server.acquisition_fields({'status': 'WAIVERS', 'waiverProcessDate': 'bad'})['waiverClearsAt'])

    def test_exact_slot_ids_and_cache(self):
        counts = {'23': 1, '0': 1, '20': 7, '6': 1}
        request = Mock()
        request.league_get.return_value = {'settings': {'rosterSettings': {'lineupSlotCounts': counts}}}
        league = SimpleNamespace(espn_request=request)
        self.assertEqual(server.football_rules(league)['lineupSlotCounts'], counts)
        server.football_rules(league)
        request.league_get.assert_called_once()

    def test_missing_rules_fail_soft(self):
        league = SimpleNamespace(espn_request=Mock())
        league.espn_request.league_get.side_effect = RuntimeError('temporary failure')
        self.assertIsNone(server.football_rules(league))

    def test_free_agents_preserve_metadata_from_same_query(self):
        league = Mock(current_week=4, year=2026)
        league.espn_request.league_get.return_value = {'players': [
            {'status': 'WAIVERS', 'waiverProcessDate': 1791010800000}, {'status': 'FREEAGENT'}]}
        with patch.object(server, 'get_league', return_value=league), patch('espn_api.football.box_player.BoxPlayer'), patch.object(server, 'player_dict', return_value={'name': 'Test'}):
            got = server.free_agents('football', 80)
        self.assertEqual([p['acquisitionState'] for p in got['players']], ['waivers', 'free_agent'])
        league.espn_request.league_get.assert_called_once()
        self.assertIn('"limit": 80', league.espn_request.league_get.call_args.kwargs['headers']['x-fantasy-filter'])

if __name__ == '__main__':
    unittest.main()
