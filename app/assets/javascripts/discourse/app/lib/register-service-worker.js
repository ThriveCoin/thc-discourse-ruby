import getAbsoluteURL, { isAbsoluteURL } from "discourse-common/lib/get-url";

export function registerServiceWorker(
  container,
  serviceWorkerURL,
  registerOptions = {}
) {
  const isSecured = document.location.protocol === "https:";

  if (isSecured && "serviceWorker" in navigator) {
    const caps = container.lookup("capabilities:main");
    const isAppleBrowser =
      caps.isSafari ||
      (caps.isIOS && !window.matchMedia("(display-mode: standalone)").matches);

    if (serviceWorkerURL && !isAppleBrowser) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          if (
            registration.active &&
            !registration.active.scriptURL.includes(serviceWorkerURL)
          ) {
            unregister(registration);
          }
        }
      });

      navigator.serviceWorker
        .register(getAbsoluteURL(`/${serviceWorkerURL}`), registerOptions)
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.info(`Failed to register Service Worker: ${error}`);
        });
    } else {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          unregister(registration);
        }
      });
    }
  }
}

function unregister(registration) {
  if (isAbsoluteURL(registration.scope)) {
    registration.unregister();
  }
}
