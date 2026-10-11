import { useI18n } from '../i18n';
import { useState, type ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Button } from '@astryxdesign/core/Button';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { X, Copy } from 'lucide-react';
import type { Json, Line } from '../lib/types';
import { stringify } from '../lib/preferences';

export function Inspector({
  line,
  editMode,
  onClose,
  onEdit,
  report,
  actions,
}: {
  line: Line;
  editMode: boolean;
  onClose: () => void;
  onEdit: (raw: string, value: Json, parseError: string | null) => void;
  report: (error: unknown) => void;
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState('json');
  const [draft, setDraft] = useState(line.parseError ? line.raw : stringify(line.value, true));
  const [error, setError] = useState<string>();
  function change(text: string) {
    setDraft(text);
    try {
      const value = JSON.parse(text) as Json;
      onEdit(JSON.stringify(value), value, null);
      setError(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      onEdit(text, null, message);
    }
  }
  return (
    <Card
      className="inspector"
      role="complementary"
      aria-label={t('rowDetails')}
      padding={0}
      elevation="high"
    >
      <Stack padding={4} gap={3} className="inspector-header">
        <Stack direction="horizontal" justify="between" align="center" wrap="wrap" gap={2}>
          <Heading level={2}>{t('lineNumber', { line: line.index + 1 })}</Heading>
          <Stack direction="horizontal" align="center" gap={1}>
            {actions}
            <IconButton
              label={t('closeDetails')}
              icon={<X size={16} />}
              variant="ghost"
              onClick={onClose}
            />
          </Stack>
        </Stack>
        <TabList value={tab} onChange={setTab}>
          <Tab value="json" label="JSON" />
          <Tab value="raw" label={t('raw')} />
        </TabList>
      </Stack>
      <Stack padding={4} gap={4} className="inspector-content">
        {line.parseError ? <Text color="secondary">{line.parseError}</Text> : null}
        {editMode ? (
          <TextArea
            className={
              draft.length > 100_000 || draft.split('\n').length > 1000
                ? 'inspector-large-editor'
                : undefined
            }
            label={t('editJson')}
            value={draft}
            onChange={change}
            rows={18}
            hasSpellCheck={false}
            status={error ? { type: 'error', message: error } : undefined}
          />
        ) : (
          <CodeBlock
            code={tab === 'raw' || line.parseError ? line.raw : stringify(line.value, true)}
            language="json"
            isWrapped
            width="100%"
            hasCopyButton={false}
          />
        )}
      </Stack>
      <Stack padding={3} gap={2} className="inspector-footer">
        {editMode ? <Text color="secondary">{t('draftHint')}</Text> : null}
        <Button
          label={tab === 'raw' ? t('copyRaw') : t('copyJson')}
          icon={<Copy size={16} />}
          variant="ghost"
          onClick={() =>
            void navigator.clipboard
              .writeText(tab === 'raw' || line.parseError ? line.raw : stringify(line.value, true))
              .catch(report)
          }
        />
      </Stack>
    </Card>
  );
}
