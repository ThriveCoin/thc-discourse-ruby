import { createWidget } from "discourse/widgets/widget";

export default createWidget("user-status-bubble", {
  tagName: "div.user-status-background",

  html(attrs) {
    const emoji = attrs.emoji ?? "mega";
    return this.attach("emoji", { name: emoji });
  },
});
