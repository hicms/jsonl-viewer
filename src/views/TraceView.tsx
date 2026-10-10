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

function Block({ block, expanded }: { block: TraceBlock; expanded: boolean }) {
  switch (block.kind) {
    case 'text':
      return <Markdown>{block.text ?? ''}</Markdown>;
    case 'thinking':
      return (
        <Collapsible trigger="思考过程" defaultIsOpen={expanded}>
          <Text color="secondary" className="preserve-lines">
            {block.text}
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
                    title="输入"
                    isWrapped
                    maxHeight={320}
                  />
                  {block.result ? (
                    <CodeBlock
                      code={stringify(block.result.output, true)}
                      title="结果"
                      isWrapped
                      maxHeight={400}
                    />
                  ) : (
                    <Text color="secondary">等待结果</Text>
                  )}
                </Stack>
              ),
            },
          ]}
        />
      );
    case 'tool-result':
      return <CodeBlock code={stringify(block.output, true)} title="工具结果" isWrapped />;
    case 'image':
      return block.data && block.mimeType?.startsWith('image/') ? (
        <img
          alt="会话图片"
          className="trace-image"
          src={`data:${block.mimeType};base64,${block.data}`}
        />
      ) : (
        <Text color="secondary">图片内容未记录</Text>
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
  const scroll = useRef<HTMLDivElement>(null);
  const jumping = useRef(false);
  const [current, setCurrent] = useState(0);
  const items = useMemo(() => {
    const filtered = trace.items.filter((item) =>
      item.searchText.includes(ui.filter.toLowerCase()),
    );
    return ui.order === 'newest' ? [...filtered].reverse() : filtered;
  }, [trace.items, ui.filter, ui.order]);
  const messages = items.filter((item) => item.kind === 'user' || item.kind === 'assistant');
  useEffect(() => {
    if (!ui.live) return;
    const timer = setTimeout(() => onUi({ live: false }), 45000);
    return () => clearTimeout(timer);
  }, [trace.items, ui.live]);
  useEffect(() => {
    if (ui.follow && scroll.current) {
      jumping.current = true;
      scroll.current.scrollTop = ui.order === 'newest' ? 0 : scroll.current.scrollHeight;
      requestAnimationFrame(() => {
        jumping.current = false;
      });
    }
  }, [items.length, ui.follow, ui.order]);
  function navigate(delta: number) {
    const next = Math.max(0, Math.min(messages.length - 1, current + delta));
    setCurrent(next);
    onUi({ follow: false });
    scroll.current
      ?.querySelector(`[data-line="${messages[next]?.sourceLine}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          const nodes = [...element.querySelectorAll<HTMLElement>('[data-message="true"]')];
          const top = element.getBoundingClientRect().top;
          const nearest = nodes.findIndex((node) => node.getBoundingClientRect().bottom > top + 20);
          if (nearest >= 0) setCurrent(nearest);
        }}
      >
        <Stack padding={6} gap={5} className={ui.wide ? 'trace-wide' : 'trace-compact'}>
          <Stack gap={2}>
            <Stack direction="horizontal" gap={2} align="center">
              <Text weight="semibold">{trace.title}</Text>
              {ui.live ? <Badge label="LIVE" variant="success" /> : null}
              {trace.traceType !== 'unknown' ? (
                <Badge label={trace.traceType === 'subagent' ? '子会话' : '主会话'} />
              ) : null}
            </Stack>
            <Text color="secondary">
              {trace.model ?? trace.harness}
              {trace.reasoningEffort ? ` · ${trace.reasoningEffort}` : ''} · {trace.stats.messages}{' '}
              条消息 · {trace.stats.toolCalls} 次工具调用 ·{' '}
              {trace.stats.inputTokens.toLocaleString()} /{' '}
              {trace.stats.outputTokens.toLocaleString()} tokens
            </Text>
            {trace.cwd ? (
              <Text type="code" color="secondary">
                {trace.cwd}
              </Text>
            ) : null}
            {trace.parentThreadId ? (
              <Button
                label={`父会话 ${trace.parentThreadId.slice(0, 12)}`}
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
          {items.map((item) => (
            <div
              key={`${item.sourceLine}/${item.kind}`}
              data-line={item.sourceLine}
              data-message={item.kind === 'user' || item.kind === 'assistant'}
              className="trace-entry"
            >
              <ChatMessage
                sender={
                  item.kind === 'user' ? 'user' : item.kind === 'assistant' ? 'assistant' : 'system'
                }
                name={
                  item.kind === 'user'
                    ? '你'
                    : item.kind === 'assistant'
                      ? trace.harness
                      : (item.label ?? '事件')
                }
                metadata={
                  <Text color="secondary">
                    {item.timestamp
                      ? new Date(item.timestamp).toLocaleTimeString('zh-CN')
                      : `第 ${item.sourceLine + 1} 行`}
                    {item.effort ? ` · ${item.effort}` : ''}
                  </Text>
                }
              >
                <ChatMessageBubble variant={item.kind === 'user' ? 'filled' : 'ghost'}>
                  <Stack gap={3}>
                    {item.blocks.map((block, i) => (
                      <Block key={`${ui.expanded}/${i}`} block={block} expanded={ui.expanded} />
                    ))}
                  </Stack>
                </ChatMessageBubble>
              </ChatMessage>
            </div>
          ))}
        </Stack>
      </div>
      <div className="trace-navigation">
        <Stack direction="horizontal" gap={2} align="center">
          {!ui.follow ? (
            <Button
              label={ui.pending ? `${ui.pending} 条新记录 · 跟随最新` : '跟随最新'}
              onClick={() => onUi({ follow: true, pending: 0 })}
            />
          ) : null}
          <IconButton
            label="上一条消息"
            icon={<ArrowUp size={16} />}
            isDisabled={current <= 0}
            onClick={() => navigate(-1)}
          />
          <Text>
            {messages.length ? current + 1 : 0} / {messages.length}
          </Text>
          <IconButton
            label="下一条消息"
            icon={<ArrowDown size={16} />}
            isDisabled={current >= messages.length - 1}
            onClick={() => navigate(1)}
          />
        </Stack>
      </div>
    </div>
  );
}
