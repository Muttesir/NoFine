import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const NotificationService = {
  requestPermission: async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  zoneEntry: async (zoneName: string, fee: number, deadline: string) => {
    const hours = Math.max(1, Math.floor((new Date(deadline).getTime() - Date.now()) / 3600000));
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `✈️ ${zoneName}`,
        body: fee > 0 ? `£${fee.toFixed(2)} due · Pay before midnight to avoid penalty` : `${zoneName} — no charge right now`,
        sound: true,
      },
      trigger: { type: 'timeInterval', seconds: 2, repeats: false } as any,
    });
  },

  scheduleDeadlineReminder: async (zoneName: string, fee: number, deadline: string) => {
    const oneHourBefore = new Date(new Date(deadline).getTime() - 3600000);
    if (oneHourBefore > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ 1 hour left — ${zoneName}`,
          body: `Pay £${fee.toFixed(2)} before midnight!`,
          sound: true,
        },
        trigger: { type: 'timeInterval', seconds: Math.floor((oneHourBefore.getTime() - Date.now()) / 1000), repeats: false } as any,
      });
    }
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

export const testNotificationIn10Seconds = async () => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Test Notification',
      body: 'Notifications are working!',
      sound: true,
    },
    trigger: { type: 'timeInterval', seconds: 10, repeats: false } as any,
  });
};
