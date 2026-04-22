import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Registers the 'dropoff_confirm' notification category with Yes/No action buttons.
 * opensAppToForeground: false → buttons respond in background without opening the app.
 * Call once on app startup.
 */
export const setupNotificationCategories = async (): Promise<void> => {
  await Notifications.setNotificationCategoryAsync('dropoff_confirm', [
    {
      identifier: 'YES',
      buttonTitle: 'Yes — Record Charge',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'NO',
      buttonTitle: 'No — Not a drop-off',
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
};

export const NotificationService = {
  requestPermission: async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },
};

export const scheduleMidnightReminder = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const tonight = new Date();
  tonight.setHours(23, 0, 0, 0);
  if (new Date() >= tonight) {
    tonight.setDate(tonight.getDate() + 1);
  }
  const seconds = Math.floor((tonight.getTime() - Date.now()) / 1000);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⏰ 1 hour to midnight!',
      body: 'Did you visit an airport today? Pay now to avoid a fine!',
      sound: true,
    },
    trigger: { type: 'timeInterval', seconds, repeats: false } as any,
  });
};

