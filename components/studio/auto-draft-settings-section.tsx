'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import PromptOptions from '@/components/studio/prompt-options';
import { useStudio } from '@/components/studio/studio-context';
import {
  BRAND_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
} from '@/components/studio/studio-styles';
import {
  getAutoDraftSettings,
  saveAutoDraftSettings,
  toggleAutoDraft,
  type AutoDraftSettingsResult,
} from '@/lib/actions/auto-draft';
import { MAX_GENERATION_PROMPT_LENGTH } from '@/lib/generation/limits';
import {
  LENGTHS,
  POST_TYPES,
  TONES,
  type PromptOptions as PromptOptionsValue,
} from '@/lib/studio/options';

type Loaded = Extract<AutoDraftSettingsResult, { status: 'ok' }>;

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  // 어느 저장소의 설정인지 함께 들고 있어 저장소가 바뀌면 이전 값을 쓰지 않음
  | { status: 'ready'; repositoryId: string; settings: Loaded };

type Notice = { kind: 'saved' } | { kind: 'error'; message: string } | null;

// 사용법 표의 옵션 값 (커밋 제목에 적는 영어 단어라 번역하지 않음)
const OPTION_VALUE_ROWS = [
  { key: 'tone', values: TONES },
  { key: 'postType', values: POST_TYPES },
  { key: 'length', values: LENGTHS },
] as const;

const OptionValueTable = () => (
  <table className="w-full text-left text-[11px] leading-[1.6] text-ink-muted">
    <tbody className="divide-y divide-line">
      {OPTION_VALUE_ROWS.map(({ key, values }) => (
        <tr key={key}>
          <th scope="row" className="w-16 py-1.5 pr-3 align-top font-medium">
            {key === 'tone' && <Trans>말투</Trans>}
            {key === 'postType' && <Trans>유형</Trans>}
            {key === 'length' && <Trans>길이</Trans>}
          </th>
          <td className="py-1.5 font-mono break-words">{values.join(' / ')}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const Switch = ({
  checked,
  disabled,
  labelledBy,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  labelledBy: string;
  onChange: (next: boolean) => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-10.5 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
      checked ? 'bg-brand' : 'bg-disabled'
    }`}
  >
    <span
      aria-hidden="true"
      className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4.5' : ''
      }`}
    />
  </button>
);

const SettingsForm = ({ initial }: { initial: Loaded }) => {
  const { t } = useLingui();
  const { repository, autoDraft } = useStudio();
  const switchLabelId = useId();
  const promptId = useId();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [options, setOptions] = useState<PromptOptionsValue>(initial.options);
  const [toggleNotice, setToggleNotice] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<Notice>(null);
  const [isToggling, startToggling] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const toggle = (next: boolean) => {
    setToggleNotice(null);
    startToggling(async () => {
      try {
        const result = await toggleAutoDraft(repository.id, next);

        if (result.status === 'ok') {
          setEnabled(next);
          // 커밋 목록의 기준점·자동 대상 표시도 바로 바꿈
          void autoDraft.refresh();
        } else if (result.status === 'unavailable') {
          setToggleNotice(
            t`브랜치의 최신 커밋을 확인하지 못해 켜지 못했습니다. 잠시 후 다시 시도해 주세요.`,
          );
        } else {
          setToggleNotice(t`저장소를 찾을 수 없습니다.`);
        }
      } catch {
        setToggleNotice(t`설정을 바꾸지 못했습니다. 다시 시도해 주세요.`);
      }
    });
  };

  const save = () => {
    setSaveNotice(null);
    startSaving(async () => {
      try {
        const result = await saveAutoDraftSettings(repository.id, {
          prompt,
          options,
        });

        if (result.status === 'ok') {
          setSaveNotice({ kind: 'saved' });
        } else if (result.status === 'model_locked') {
          setSaveNotice({
            kind: 'error',
            message: t`현재 등급에서는 선택할 수 없는 모델입니다.`,
          });
        } else if (result.status === 'invalid') {
          setSaveNotice({
            kind: 'error',
            message: t`입력한 내용을 확인해 주세요.`,
          });
        } else {
          setSaveNotice({
            kind: 'error',
            message: t`저장소를 찾을 수 없습니다.`,
          });
        }
      } catch {
        setSaveNotice({
          kind: 'error',
          message: t`저장하지 못했습니다. 다시 시도해 주세요.`,
        });
      }
    });
  };

  const trimmedLength = prompt.trim().length;
  const isTooLong = trimmedLength > MAX_GENERATION_PROMPT_LENGTH;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p
            id={switchLabelId}
            className="text-[13px] leading-[1.6] font-medium text-ink"
          >
            <Trans>자동 초안 작성</Trans>
          </p>
          <p className="text-[12px] leading-[1.6] break-keep text-ink-faint">
            <Trans>
              연동 브랜치에 푸시한 커밋의 제목이 [comdraft] 로 시작하면 초안을
              자동으로 만듭니다.
            </Trans>
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={isToggling}
          labelledBy={switchLabelId}
          onChange={toggle}
        />
      </div>
      {toggleNotice && (
        <p role="alert" className="text-[12px] leading-[1.6] text-danger">
          {toggleNotice}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={promptId}
          className="text-[12px] leading-[normal] font-medium text-ink"
        >
          <Trans>요청 문구 프리셋</Trans>
        </label>
        <textarea
          id={promptId}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          placeholder={t`예: 이번 커밋에서 해결한 문제와 과정을 경험담처럼 정리해 주세요.`}
          className="w-full resize-y rounded border border-line bg-white px-3 py-2.5 text-[13px] leading-[1.6] text-ink placeholder:text-ink-subtle"
        />
        <p
          className={`text-right text-[11px] leading-[normal] ${
            isTooLong ? 'text-danger' : 'text-ink-faint'
          }`}
        >
          {trimmedLength} / {MAX_GENERATION_PROMPT_LENGTH}
        </p>
      </div>

      <PromptOptions
        value={options}
        onChange={setOptions}
        allowedModels={initial.allowedModels}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isSaving || isTooLong}
          className={`h-8.5 ${BRAND_BUTTON_CLASS}`}
        >
          {isSaving ? <Trans>저장하는 중...</Trans> : <Trans>저장</Trans>}
        </button>
        {saveNotice && (
          <p
            role={saveNotice.kind === 'saved' ? 'status' : 'alert'}
            className={`text-[12px] leading-[1.6] ${
              saveNotice.kind === 'saved' ? 'text-brand' : 'text-danger'
            }`}
          >
            {saveNotice.kind === 'saved' ? (
              <Trans>저장했습니다.</Trans>
            ) : (
              saveNotice.message
            )}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-md bg-surface p-4">
        <p className="text-[12px] leading-[1.6] font-medium text-ink">
          <Trans>사용법</Trans>
        </p>
        <p className="text-[12px] leading-[1.6] break-keep text-ink-muted">
          <Trans>
            커밋 제목을 [comdraft] 로 시작하고, 뒤에 옵션을 공백으로 이어 쓰면
            이 커밋만 그 옵션으로 만듭니다. 쓰지 않은 옵션은 위에서 저장한
            기본값을 따릅니다.
          </Trans>
        </p>
        <code className="block rounded bg-white px-3 py-2 font-mono text-[12px] leading-[1.6] break-all text-ink">
          [comdraft] friendly short
        </code>
        <OptionValueTable />
        <p className="text-[12px] leading-[1.6] break-keep text-ink-faint">
          <Trans>
            머지로 들어온 커밋(PR 머지 포함), 머지 커밋, GitHub 에서 만든 커밋,
            force push 로 올라온 커밋은 모이지 않습니다.
          </Trans>
        </p>
      </div>
    </div>
  );
};

/**
 * 저장소 설정: 커밋으로 초안 만들기 (토글, 요청 문구 프리셋, 기본 옵션, 사용법)
 * - 섹션을 처음 그릴 때 한 번 조회, 실패하면 다시 시도 버튼
 */
const AutoDraftSettingsSection = () => {
  const { repository } = useStudio();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isStale = false;

    getAutoDraftSettings(repository.id)
      .then((result) => {
        if (!isStale) {
          setState(
            result.status === 'ok'
              ? {
                  status: 'ready',
                  repositoryId: repository.id,
                  settings: result,
                }
              : { status: 'error' },
          );
        }
      })
      .catch(() => {
        if (!isStale) {
          setState({ status: 'error' });
        }
      });

    return () => {
      isStale = true;
    };
  }, [repository.id, attempt]);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[12px] leading-[normal] font-bold text-ink-faint">
        <Trans>커밋으로 초안 만들기</Trans>
      </h3>
      {(state.status === 'loading' ||
        (state.status === 'ready' && state.repositoryId !== repository.id)) && (
        <div
          aria-hidden="true"
          className="h-40 w-full animate-pulse rounded bg-surface"
        />
      )}
      {state.status === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-[13px] leading-[1.6] text-danger">
            <Trans>설정을 불러오지 못했습니다.</Trans>
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((previous) => previous + 1);
            }}
            className={`h-8.5 text-[12px] leading-[normal] font-medium ${OUTLINE_BUTTON_CLASS}`}
          >
            <Trans>다시 시도</Trans>
          </button>
        </div>
      )}
      {state.status === 'ready' && state.repositoryId === repository.id && (
        // 저장소마다 새로 그려 입력 중인 값이 다른 저장소로 넘어가지 않게 함
        <SettingsForm key={repository.id} initial={state.settings} />
      )}
    </section>
  );
};

export default AutoDraftSettingsSection;
