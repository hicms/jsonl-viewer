import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Globe, Sun, Moon, Minus, Plus } from 'lucide-react';
import { useI18n } from '../i18n';

export function WorkspacePreferences({
  mode,
  setMode,
  zoom,
  onZoom,
}: {
  mode: 'light' | 'dark' | 'system';
  setMode: (mode: 'light' | 'dark' | 'system') => void;
  zoom: number;
  onZoom: (action: 'zoom-in' | 'zoom-out' | 'zoom-reset') => void;
}) {
  const { t, preference, setPreference } = useI18n();
  return (
    <Stack padding={2}>
      <div className="workspace-preferences">
        <Stack direction="horizontal" align="center" gap={2}>
          <Globe size={16} />
          <Text type="supporting">{t('language')}</Text>
        </Stack>
        <Selector
          label={t('language')}
          isLabelHidden
          value={preference}
          onChange={(value) => setPreference(value as 'system' | 'en' | 'zh-CN')}
          options={[
            { value: 'system', label: t('system') },
            { value: 'en', label: 'English' },
            { value: 'zh-CN', label: '简体中文' },
          ]}
          width="fill"
          size="sm"
        />
        <Stack direction="horizontal" align="center" gap={2}>
          {mode === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          <Text type="supporting">{t('themeMode')}</Text>
        </Stack>
        <Selector
          label={t('themeMode')}
          isLabelHidden
          value={mode}
          onChange={(value) => setMode(value as typeof mode)}
          options={[
            { value: 'light', label: t('light') },
            { value: 'dark', label: t('dark') },
            { value: 'system', label: t('system') },
          ]}
          width="fill"
          size="sm"
        />
        <Text type="supporting">{t('zoom')}</Text>
        <Stack direction="horizontal" align="center" gap={1} className="workspace-zoom">
          <IconButton
            label={t('zoomOut')}
            icon={<Minus size={14} />}
            variant="ghost"
            size="sm"
            isDisabled={zoom <= 0.8}
            onClick={() => onZoom('zoom-out')}
          />
          <Button
            label={`${Math.round(zoom * 100)}%`}
            variant="ghost"
            size="sm"
            onClick={() => onZoom('zoom-reset')}
          />
          <IconButton
            label={t('zoomIn')}
            icon={<Plus size={14} />}
            variant="ghost"
            size="sm"
            isDisabled={zoom >= 1.5}
            onClick={() => onZoom('zoom-in')}
          />
        </Stack>
      </div>
    </Stack>
  );
}
