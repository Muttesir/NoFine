import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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
    const hours = Math.floor((new Date(deadline).getTime() - Date.now()) / 3600000);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `✈️ ${zoneName} — Charge Started`,
        body: `£${fee.toFixed(2)} due · Pay within ${hours} hours to avoid penalty`,
        sound: true,
        data: { type: 'zone_entry' },
      },
      trigger: null,
    });
  },

  urgentReminder: async (zoneName: string, fee: number, minutesLeft: number) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🚨 ${minutesLeft} minutes left — ${zoneName}`,
        body: `Pay £${fee.toFixed(2)} NOW or risk a fine!`,
        sound: true,
        data: { type: 'urgent' },
      },
      trigger: null,
    });
  },

  paymentSuccess: async (zoneName: string, fee: number, penaltyAvoided: number) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `✅ Payment Complete — ${zoneName}`,
        body: `£${fee.toFixed(2)} paid · You avoided a £${penaltyAvoided} penalty!`,
        sound: true,
        data: { type: 'paid' },
      },
      trigger: null,
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
        trigger: { date: oneHourBefore },
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
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⏰ 1 hour to midnight!',
      body: 'Did you visit an airport today? Pay now to avoid a fine!',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: tonight,
    },
  });
};
