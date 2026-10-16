import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { dismissDialog, useDialogRequest, type DialogAction } from '../dialogStore';
import { useTheme } from '../ThemeContext';
import { SPACE, type Colors } from '../theme';

/**
 * Draws whatever showDialog() was last asked for.
 *
 * Mounted once, at the root, so any screen — and any code that is not a
 * screen at all — can put a question on top of the app without each one
 * carrying its own modal.
 *
 * The ordering follows the platform's habit so muscle memory still works:
 * anything that merely closes it sits first and quiet, and a destructive
 * answer sits last in the alert colour.
 */
export function DialogHost() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const request = useDialogRequest();

  if (!request) return null;

  const actions: DialogAction[] = request.actions?.length
    ? request.actions
    : [{ label: 'OK', cancel: true }];

  const answer = (action: DialogAction) => {
    dismissDialog();
    action.onPress?.();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Android's back button must close it, as it closes a system alert.
      onRequestClose={dismissDialog}
      statusBarTranslucent
    >
      <Pressable style={styles.scrim} onPress={dismissDialog}>
        {/* Stops a press inside the card reaching the scrim behind it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={[type.label, styles.title]}>{request.title.toUpperCase()}</Text>
          {request.message ? (
            <Text style={[type.body, styles.message]}>{request.message}</Text>
          ) : null}

          <View style={styles.actions}>
            {actions.map((action, index) => (
              <Pressable
                key={`${action.label}-${index}`}
                onPress={() => answer(action)}
                hitSlop={8}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text
                  style={[
                    type.label,
                    action.destructive
                      ? styles.destructive
                      : action.cancel
                        ? styles.quiet
                        : styles.primary,
                  ]}
                >
                  {action.label.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: SPACE.page,
    },
    card: {
      backgroundColor: colors.paper,
      borderLeftWidth: 2,
      borderLeftColor: colors.moss,
      paddingVertical: 20,
      paddingHorizontal: 18,
      gap: 12,
      maxWidth: 420,
      width: '100%',
      alignSelf: 'center',
    },
    title: { color: colors.moss },
    message: { color: colors.ink },
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 22, paddingTop: 4 },
    action: { paddingVertical: 4 },
    pressed: { opacity: 0.6 },
    primary: { color: colors.ink },
    quiet: { color: colors.mist },
    destructive: { color: colors.alert },
  });
}
