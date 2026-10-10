import { useI18n } from '../i18n';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Pencil, Save } from 'lucide-react';
import type { Session } from '../lib/types';
import type { WorkspaceController } from '../workspace/useWorkspace';

export function DocumentActions({
  session,
  workspace,
}: {
  session: Session;
  workspace: WorkspaceController;
}) {
  const { t } = useI18n();
  const { snapshot, ui } = session;
  return (
    <>
      {ui.view !== 'trace' ? (
        <IconButton
          label={ui.editMode ? t('editing') : t('edit')}
          tooltip={ui.editMode ? t('exitEdit') : t('editJson')}
          icon={<Pencil size={16} />}
          variant={ui.editMode ? 'primary' : 'ghost'}
          onClick={() => {
            workspace.ui(snapshot.id, { editMode: !ui.editMode });
            if (ui.editMode && ui.changed && !Object.keys(session.edits).length)
              void workspace.request(snapshot.id, 'refresh');
          }}
        />
      ) : null}
      <IconButton
        label={t('save')}
        tooltip={t('saveFile')}
        icon={<Save size={16} />}
        isDisabled={
          session.busy ||
          !Object.keys(session.edits).length ||
          Object.values(session.edits).some((patch) => patch.parseError)
        }
        onClick={() => void workspace.save(snapshot.id)}
      />
    </>
  );
}
