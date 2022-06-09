import { isLegacyEmber } from "discourse-common/config/environment";
import { run } from "@ember/runloop";
import tippy from "tippy.js";
import { iconHTML } from "discourse-common/lib/icon-library";

export const hideOnEscapePlugin = {
  name: "hideOnEscape",

  defaultValue: true,

  fn({ hide }) {
    function onKeyDown(event) {
      if (event.keyCode === 27) {
        hide();
      }
    }

    return {
      onShow() {
        document.addEventListener("keydown", onKeyDown);
      },
      onHide() {
        document.removeEventListener("keydown", onKeyDown);
      },
    };
  },
};

// legacy, shouldn't be needed with setup
export function hidePopover(event) {
  if (event?.target?._tippy) {
    showPopover(event);
  }
}

// legacy, setup() should be used
export function showPopover(event, options = {}) {
  const instance = event.target._tippy
    ? event.target._tippy
    : setup(event.target, options);

  // hangs on legacy ember
  if (!isLegacyEmber) {
    run.begin();
    instance.popper.addEventListener("transitionend", run.end, {
      once: true,
    });
  }

  if (instance.state.isShown) {
    instance.hide();
  } else {
    instance.show();
  }
}

// target is the element that triggers the display of the popover
// options accepts all tippy.js options as defined in their documentation
// https://atomiks.github.io/tippyjs/v6/all-props/
export default function setup(target, options) {
  const tippyOptions = Object.assign(
    {
      arrow: iconHTML("tippy-rounded-arrow"),
      content: options.textContent || options.htmlContent,
      allowHTML: options?.htmlContent?.length,
      trigger: "mouseenter click",
      hideOnClick: true,
      zIndex: 1400,
      plugins: [hideOnEscapePlugin],
      touch: ["hold", 500],
    },
    options
  );

  // legacy support
  delete tippyOptions.textContent;
  delete tippyOptions.htmlContent;

  return tippy(target, tippyOptions);
}
