import { useI18n } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage, ChatMessageBubble, ChatToolCalls } from '@astryxdesign/core/Chat';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Markdown } from '@astryxdesign/core/Markdown';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { FileUi, Trace, TraceBlock } from '../lib/types';
import { stringify } from '../lib/preferences';

const eventLabels = {
  error: 'eventError',
  turn_aborted: 'turnAborted',
  compacted: 'contextCompacted',
} as const;

function Block({ block, expanded }: { block: TraceBlock; expanded: boolean }) {
  const { t } = useI18n();
  switch (block.kind) {
    case 'text':
      return <Markdown>{block.text ?? ''}</Markdown>;
    case 'thinking':
      return (
        <Collapsible trigger={t('thinking')} defaultIsOpen={expanded}>
          <Text color="secondary" className="preserve-lines">
            {block.redacted ? t('redactedThinking') : block.text}
          </Text>
        </Collapsible>
      );
    case 'tool-call':
      return (
        <ChatToolCalls
          defaultIsExpanded={expanded}
          calls={[
            {
              name: block.name ?? 'tool',
              status: block.result ? (block.result.error ? 'error' : 'complete') : 'pending',
              target: stringify(block.input).slice(0, 160),
              resultDetail: (
                <Stack gap={2}>
                  <CodeBlock
                    code={stringify(block.input, true)}
                    language="json"
                    title={t('input')}
                    isWrapped
                    maxHeight={320}
                  />
                  {block.result ? (
                    <CodeBlock
                      code={stringify(block.result.output, true)}
                      title={t('result')}
                      isWrapped
                      maxHeight={400}
                    />
                  ) : (
                    <Text color="secondary">{t('waitingResult')}</Text>
                  )}
                </Stack>
              ),
            },
          ]}
        />
      );
    case 'tool-result':
      return <CodeBlock code={stringify(block.output, true)} title={t('toolResult')} isWrapped />;
    case 'image':
      return block.data && block.mimeType?.startsWith('image/') ? (
        <img
          alt={t('sessionImage')}
          className="trace-image"
          src={`data:${block.mimeType};base64,${block.data}`}
        />
      ) : (
        <Text color="secondary">{t('missingImage')}</Text>
      );
  }
}

export function TraceView({
  trace,
  ui,
  onUi,
  onRelated,
}: {
  trace: Trace;
  ui: FileUi;
  onUi: (patch: Partial<FileUi>) => void;
  onRelated: (id: string) => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const scroll = useRef<HTMLDivElement>(null);
  const jumping = useRef(false);
  const [current, setCurrent] = useState(0);
  const items = useMemo(() => {
    const filtered = trace.items.filter((item) =>
      (
        item.searchText +
        '\n' +
        (item.eventType ? t(eventLabels[item.eventType]) : '') +
        '\n' +
        item.blocks
          .filter((block) => block.redacted)
          .map(() => t('redactedThinking'))
          .join('\n')
      )
        .toLowerCase()
        .includes(ui.filter.toLowerCase()),
    );
    return ui.order === 'newest' ? [...filtered].reverse() : filtered;
  }, [trace.items, ui.filter, ui.order, t]);
  const messages = useMemo(
    () => items.filter((item) => item.kind === 'user' || item.kind === 'assistant'),
    [items],
  );
  const currentMessage = Math.min(current, Math.max(0, messages.length - 1));
  function updateCurrent() {
    const element = scroll.current;
    if (!element) return;
    const nodes = [...element.querySelectorAll<HTMLElement>('.trace-entry[data-message="true"]')];
    const top = element.getBoundingClientRect().top;
    const nearest = nodes.findIndex((node) => node.getBoundingClientRect().bottom > top + 20);
    setCurrent(Math.max(0, nearest));
  }
  useEffect(() => {
    const element = scroll.current;
    if (jumping.current && element) {
      element.scrollTo({ top: element.scrollTop, behavior: 'instant' });
      jumping.current = false;
    }
    updateCurrent();
  }, [messages]);
  useEffect(() => {
    if (!ui.live) return;
    const timer = setTimeout(() => onUi({ live: false }), 45000);
    return () => clearTimeout(timer);
  }, [trace.items, ui.live]);
  useEffect(() => {
    if (ui.follow && scroll.current) {
      jumping.current = true;
      scroll.current.scrollTop = ui.order === 'newest' ? 0 : scroll.current.scrollHeight;
      const frame = requestAnimationFrame(() => {
        updateCurrent();
        jumping.current = false;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [items.length, ui.follow, ui.order]);
  function navigate(delta: number) {
    const next = Math.max(0, Math.min(messages.length - 1, currentMessage + delta));
    const element = scroll.current;
    const target = element?.querySelector<HTMLElement>(
      `.trace-entry[data-message="true"][data-line="${messages[next]?.sourceLine}"]`,
    );
    if (!element || !target) return;
    const top = Math.max(
      0,
      Math.min(
        element.scrollHeight - element.clientHeight,
        element.scrollTop +
          target.getBoundingClientRect().top -
          element.getBoundingClientRect().top,
      ),
    );
    jumping.current = Math.abs(top - element.scrollTop) > 1;
    setCurrent(next);
    onUi({ follow: false });
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,[contenteditable]')) return;
      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        navigate(event.key === '[' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  return (
    <div className="trace-view">
      <div
        className="trace-scroll"
        ref={scroll}
        onScroll={() => {
          const element = scroll.current;
          if (!element || jumping.current) return;
          const near =
            ui.order === 'newest'
              ? element.scrollTop < 60
              : element.scrollHeight - element.scrollTop - element.clientHeight < 60;
          if (near !== ui.follow) onUi({ follow: near, pending: near ? 0 : ui.pending });
          updateCurrent();
        }}
        onScrollEnd={() => {
          jumping.current = false;
        }}
      >
        <Stack padding={6} gap={5} className={ui.wide ? 'trace-wide' : 'trace-compact'}>
          <Stack gap={2}>
            <Stack direction="horizontal" gap={2} align="center">
              <Text weight="semibold">
                {trace.title ?? t('sessionTitle', { harness: trace.harness })}
              </Text>
              {ui.live ? <Badge label={t('live')} variant="success" /> : null}
              {trace.traceType !== 'unknown' ? (
                <Badge
                  label={trace.traceType === 'subagent' ? t('childSessions') : t('mainSession')}
                />
              ) : null}
            </Stack>
            <Text color="secondary">
              {trace.model ?? trace.harness}
              {trace.reasoningEffort ? ` · ${trace.reasoningEffort}` : ''} ·{' '}
              {t('sessionStats', {
                messages: trace.stats.messages,
                calls: trace.stats.toolCalls,
                input: trace.stats.inputTokens,
                output: trace.stats.outputTokens,
              })}
            </Text>
            {trace.cwd ? (
              <Text type="code" color="secondary">
                {trace.cwd}
              </Text>
            ) : null}
            {trace.parentThreadId ? (
              <Button
                label={t('parentSession', { id: trace.parentThreadId.slice(0, 12) })}
                variant="ghost"
                onClick={() => onRelated(trace.parentThreadId!)}
              />
            ) : null}
            {trace.subagent?.agentRole ? (
              <Text color="secondary">
                {trace.subagent.agentRole}
                {trace.subagent.agentNickname ? ` · ${trace.subagent.agentNickname}` : ''}
              </Text>
            ) : null}
          </Stack>
          {items.map((item) => {
            const name =
              item.kind === 'user'
                ? t('you')
                : item.kind === 'assistant'
                  ? trace.harness
                  : item.eventType
                    ? t(eventLabels[item.eventType])
                    : (item.label ?? t('event'));
            return (
              <div
                key={`${item.sourceLine}/${item.kind}`}
                data-line={item.sourceLine}
                data-message={item.kind === 'user' || item.kind === 'assistant'}
                className="trace-entry"
              >
                <ChatMessage
                  sender={
                    item.kind === 'user'
                      ? 'user'
                      : item.kind === 'assistant'
                        ? 'assistant'
                        : 'system'
                  }
                  name={name}
                  metadata={
                    <Text color="secondary">
                      {item.timestamp
                        ? new Date(item.timestamp).toLocaleTimeString(locale)
                        : t('lineNumber', { line: item.sourceLine + 1 })}
                      {item.effort ? ` · ${item.effort}` : ''}
                    </Text>
                  }
                >
                  <ChatMessageBubble variant={item.kind === 'user' ? 'filled' : 'ghost'}>
                    <Stack gap={3}>
                      {item.kind !== 'user' && item.kind !== 'assistant' ? (
                        <Text weight="semibold">{name}</Text>
                      ) : null}
                      {item.blocks.map((block, i) => (
                        <Block key={`${ui.expanded}/${i}`} block={block} expanded={ui.expanded} />
                      ))}
                    </Stack>
                  </ChatMessageBubble>
                </ChatMessage>
              </div>
            );
          })}
        </Stack>
      </div>
      <div className="trace-navigation">
        <Stack direction="horizontal" gap={2} align="center">
          {!ui.follow ? (
            <Button
              label={ui.pending ? t('newRecords', { count: ui.pending }) : t('followLatest')}
              onClick={() => onUi({ follow: true, pending: 0 })}
            />
          ) : null}
          <IconButton
            label={t('previousMessage')}
            icon={<ArrowUp size={16} />}
            isDisabled={!messages.length || currentMessage <= 0}
            onClick={() => navigate(-1)}
          />
          <Text>
            {messages.length ? currentMessage + 1 : 0} / {messages.length}
          </Text>
          <IconButton
            label={t('nextMessage')}
            icon={<ArrowDown size={16} />}
            isDisabled={currentMessage >= messages.length - 1}
            onClick={() => navigate(1)}
          />
        </Stack>
      </div>
    </div>
  );
}
