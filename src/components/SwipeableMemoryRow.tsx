import type { ComponentProps } from 'react';
import { deleteMemory, setMemoryStatus } from '../db/queries';
import { showSnackbar } from '../snackbarStore';
import { MemoryRow } from './MemoryRow';
import { SwipeRow, type SwipeAction } from './SwipeRow';

type Props = ComponentProps<typeof MemoryRow>;

/**
 * A record row you can swipe: right to tick it off (or put it back), left to
 * delete it. Both come with an Undo.
 *
 * Ticking off happens at once — it is one cheap change, and putting it back
 * is the same change the other way. Deleting is held back until the Undo has
 * gone, so taking it back is simply never having done it.
 *
 * Notes that are only a record of something ("met Anu for lunch") have
 * nothing to tick off, so they swipe only to delete.
 */
export function SwipeableMemoryRow(props: Props) {
  const { memory } = props;
  const done = memory.status !== 'active';

  const toggle: SwipeAction | undefined =
    memory.type === 'memory'
      ? undefined
      : {
          label: done ? 'Reopen' : 'Done',
          icon: done ? 'arrow-undo-outline' : 'checkmark',
          tone: 'moss',
          onTrigger: () => {
            const before = memory.status;
            const after = done ? 'active' : 'done';
            void setMemoryStatus(memory.id, after);
            showSnackbar({
              message: after === 'done' ? `Done: ${memory.title}` : `Reopened: ${memory.title}`,
              onAction: () => void setMemoryStatus(memory.id, before),
            });
          },
        };

  const remove: SwipeAction = {
    label: 'Delete',
    icon: 'trash-outline',
    tone: 'alert',
    removes: true,
    onTrigger: ({ restore }) => {
      showSnackbar({
        message: `Deleted ${memory.title}`,
        onAction: restore,
        onCommit: () => deleteMemory(memory.id),
      });
    },
  };

  return (
    <SwipeRow left={toggle} right={remove}>
      <MemoryRow {...props} />
    </SwipeRow>
  );
}
