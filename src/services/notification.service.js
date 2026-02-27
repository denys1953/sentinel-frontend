export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return Notification.permission === "granted";
};

export const showNotification = (title, body, senderFp) => {
  if (Notification.permission === "granted" && document.visibilityState !== "visible") {
    try {
      const notification = new Notification(title, {
        body: body,
        icon: "/vite.svg",
        tag: senderFp,
        badge: "/vite.svg",
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.error("Не вдалося показати сповіщення:", err);
    }
  }
};
