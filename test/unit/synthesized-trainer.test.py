import ast
import json
import hashlib
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/finetune_v3_synthesized.py'


def trainer_functions():
    tree = ast.parse(SOURCE.read_text())
    names = {'render_example', 'locate_decision_token_span', 'encode_example', 'load_pinned_tokenizer', 'decision_token_ids'}
    constants = {'BOS_ID', 'EOS_ID', 'PAD_ID', 'PREFIX_BOILERPLATE_TOKENS', 'VERDICT_INDEX', 'IM_START', 'IM_END', 'TOOLS_START', 'TOOLS_END', 'TOOL_CALL_START', 'TOOL_CALL_END', 'THINK_START', 'THINK_END'}
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names or isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in constants for target in node.targets)]
    scope = dict(globals())
    scope.update(BOS_ID=2, EOS_ID=1, PAD_ID=0, IM_START='<|im_start|>', IM_END='<|im_end|>', TOOLS_START='<tools>', TOOLS_END='</tools>', TOOL_CALL_START='<tool_call>', TOOL_CALL_END='</tool_call>', THINK_START='<think>', THINK_END='</think>', VERDICT_NAMES=('approve', 'deny', 'ask'))
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(SOURCE), 'exec'), scope)
    return scope


class CharacterTokenizer:
    def encode(self, text):
        return list(map(ord, text))


class SynthesizedTrainerTest(unittest.TestCase):
    def test_risk_tokens_come_from_the_loaded_tokenizer(self):
        class Tokenizer:
            def encode(self, text):
                return {'approve': [17, 18], 'deny': [29], 'ask': [41]}[text]
        self.assertEqual(trainer_functions()['decision_token_ids'](Tokenizer()), (17, 29, 41))

    def test_ambiguous_first_verdict_tokens_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'distinct first token'):
            trainer_functions()['decision_token_ids'](CharacterTokenizer())

    def test_changed_tokenizer_is_rejected_before_loading_a_tokenizer_library(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'tokenizer.model'
            file.write_bytes(b'changed tokenizer')
            with self.assertRaisesRegex(ValueError, 'Tokenizer digest differs'):
                trainer_functions()['load_pinned_tokenizer'](str(file), 'wrong', 8192, 'unused', 'unused')

    def test_oversized_examples_are_rejected_before_training_targets_are_lost(self):
        encode = trainer_functions()['encode_example']
        example = {'query': 'x' * 4096, 'tools': [], 'answers': [{'name': 'approve', 'arguments': {}}]}
        with self.assertRaisesRegex(ValueError, 'exceeds max_len'):
            encode(CharacterTokenizer(), example, 1024)

    def test_fitting_examples_keep_the_complete_answer_and_supervision(self):
        functions = trainer_functions()
        for verdict in ['approve', 'deny', 'ask']:
            example = {'query': 'Read the requested local file.', 'tools': [], 'answers': [{'name': verdict, 'arguments': {}}]}
            prompt, target = functions['render_example'](example)
            expected = [functions['BOS_ID']] + CharacterTokenizer().encode(prompt + target) + [functions['EOS_ID']]
            ids, mask, position, target_id = functions['encode_example'](CharacterTokenizer(), example, len(expected))
            self.assertEqual(ids, expected)
            self.assertEqual(len(mask), len(ids))
            self.assertGreater(sum(mask), 0)
            self.assertLess(position, len(ids) - 1)
            self.assertEqual(target_id, functions['VERDICT_INDEX'][verdict])


if __name__ == '__main__':
    unittest.main()
