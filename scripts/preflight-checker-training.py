import hashlib
import importlib.util
import json
from pathlib import Path
import sys


def digest(file):
    with Path(file).open('rb') as handle:
        result = hashlib.sha256()
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def preflight(directory, output):
    directory = Path(directory).resolve()
    output = Path(output)
    if output.exists():
        raise FileExistsError('Preserve existing preflight evidence; choose a new output')
    plan_file = directory / 'study-plan.json'
    plan = json.loads(plan_file.read_text())
    for name, expected in plan['files'].items():
        if digest(directory / name) != expected:
            raise ValueError('Study file changed: ' + name)
    for name, artifact in plan['assets'].items():
        if digest(artifact['path']) != artifact['sha256']:
            raise ValueError('Pinned asset changed: ' + name)
    spec = importlib.util.spec_from_file_location('frozen_trainer', directory / 'trainer.py')
    trainer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(trainer)
    tokenizer = trainer.load_pinned_tokenizer(plan['assets']['tokenizer']['path'], plan['assets']['tokenizer']['sha256'], plan['training']['vocabSize'], plan['assets']['baseArchive']['path'], plan['tokenizerBlobSha256'])
    leads = trainer.decision_token_ids(tokenizer)
    seen = set()
    cases = []
    for split, name in plan['data'].items():
        rows = [json.loads(line) for line in (directory / name).read_text().splitlines() if line]
        for index, row in enumerate(rows):
            visible = {'query': row['query'], 'tools': row['tools']}
            visible_hash = hashlib.sha256(json.dumps(visible, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            if visible_hash in seen:
                raise ValueError('Repeated exact input across frozen study cases')
            seen.add(visible_hash)
            maximum = 0
            for verdict, lead in zip(trainer.VERDICT_NAMES, leads):
                example = {**visible, 'answers': [{'name': verdict, 'arguments': {}}]}
                prompt, target = trainer.render_example(example)
                length = len(tokenizer.encode(prompt)) + len(tokenizer.encode(target)) + 2
                maximum = max(maximum, length)
                ids, mask, position, target_id = trainer.encode_example(tokenizer, example, plan['training']['maxLength'])
                if ids[position + 1] != lead or target_id != trainer.VERDICT_INDEX[verdict] or sum(mask) <= 0:
                    raise ValueError('Verdict position or complete supervision is inconsistent')
            cases.append({'split': split, 'index': index, 'visibleInputSha256': visible_hash, 'maximumTokensAllVerdicts': maximum})
        print(json.dumps({'checkedSplit': split, 'cases': len(rows)}), flush=True)
    result = {'status': 'admitted-for-scoped-experiment', 'studyPlanSha256': digest(plan_file), 'sourceFilesVerified': plan['files'], 'assetsVerified': plan['assets'], 'tokenizerSource': 'Pinned native archive reference tokenizer', 'tokenizerBlobSha256': plan['tokenizerBlobSha256'], 'verdictTokens': {name: tokenizer.encode(name) for name in trainer.VERDICT_NAMES}, 'riskTokenIds': list(leads), 'cases': len(cases), 'maximumTokens': max(row['maximumTokensAllVerdicts'] for row in cases), 'configuredMaximum': plan['training']['maxLength'], 'allThreeTargetsChecked': True, 'targetPositionsVerified': True, 'generatedCommandsExecuted': False, 'trainingStarted': False, 'freshBlindEvaluationQualified': False, 'productPromotionAllowed': False, 'details': cases}
    output.write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    result = preflight(sys.argv[1], sys.argv[2])
    print(json.dumps({key: value for key, value in result.items() if key != 'details'}, indent=2))
