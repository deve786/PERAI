import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { dismissDialog, useDialogRequest, type DialogAction } from '../dialogStore';
import { useTheme } from '../ThemeContext';
import { FONTS, RADIUS, SPACE, type Colors } from '../theme';

/** Older callers may still pass titles in capitals; show them in sentence case. */
function sentence(text: string) {
  return text.length > 2 && text === text.toUpperCase() && /[A-Z]/.test(text)
    ? text.charAt(0) + text.slice(1).toLowerCase()
    : text;
}

/**
 * Draws whatever showDialog() was last asked for.
 *
 * Mounted once, at the root, so any screen — and any code that is not a
 * screen at all — can put a question on top of the app without each one
 * carrying its own modal.
 *
 * The ordering follows the platform's habit so muscle memory still works:
 * anything that merely closes it sits first and outlined, and a destructive
 * answer sits last in the alert colour. Up to two answers sit side by side;
 * more stack full width so long labels (bank names) never squeeze.
 */
export function DialogHost() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const request = useDialogRequest();

  if (!request) return null;

  const actions: DialogAction[] = request.actions?.length
    ? request.actions
    : [{ label: 'OK', cancel: true }];
  const stacked = actions.length > 2;

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
          <Text style={styles.title}>{sentence(request.title)}</Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {actions.map((action, index) => {
              // A lone OK is the main answer, not a quiet dismissal.
              const kind = action.destructive
                ? 'destructive'
                : action.cancel && actions.length > 1
                  ? 'quiet'
                  : 'primary';
              return (
                <Pressable
                  key={`${action.label}-${index}`}
                  onPress={() => answer(action)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    kind === 'primary' && styles.buttonPrimary,
                    kind === 'destructive' && styles.buttonDestructive,
                    kind === 'quiet' && styles.buttonQuiet,
                    stacked && styles.buttonStacked,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    numberOfLines={2}
                    style={[styles.buttonText, kind === 'quiet' ? styles.quietText : styles.solidText]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
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
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: SPACE.page,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.rule,
      padding: 20,
      gap: 8,
      maxWidth: 380,
      width: '100%',
      alignSelf: 'center',
    },
    title: { fontFamily: FONTS.sansSemi, fontSize: 18, lineHeight: 24, color: colors.ink },
    message: { fontFamily: FONTS.sans, fontSize: 15, lineHeight: 21, color: colors.graphite },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 10,
      paddingTop: 14,
    },
    actionsStacked: { flexDirection: 'column', alignItems: 'stretch' },
    button: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: RADIUS.button,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonStacked: { alignSelf: 'stretch' },
    buttonPrimary: { backgroundColor: colors.mossFill },
    buttonDestructive: { backgroundColor: colors.alert },
    buttonQuiet: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    buttonText: { fontFamily: FONTS.sansSemi, fontSize: 16, textAlign: 'center' },
    solidText: { color: colors.onAccent },
    quietText: { color: colors.ink },
    pressed: { opacity: 0.7 },
  });
}
