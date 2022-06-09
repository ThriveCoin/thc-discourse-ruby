import DecoratorHelper from "discourse/widgets/decorator-helper";
import PostCooked from "discourse/widgets/post-cooked";
import { createWidget } from "discourse/widgets/widget";
import { h } from "virtual-dom";
import hbs from "discourse/widgets/hbs-compiler";

createWidget("post-link-arrow", {
  tagName: "div.post-link-arrow",

  template: hbs`
    {{#if attrs.above}}
      <a href={{attrs.shareUrl}} class="post-info arrow" title={{i18n "topic.jump_reply_up"}}>
        {{d-icon "arrow-up"}}
      </a>
    {{else}}
      <a href={{attrs.shareUrl}} class="post-info arrow" title={{i18n "topic.jump_reply_down"}}>
        {{d-icon "arrow-down"}}
      </a>
    {{/if}}
  `,
});

export default createWidget("embedded-post", {
  tagName: "div.reply",
  buildKey: (attrs) => `embedded-post-${attrs.id}`,

  buildAttributes(attrs) {
    const attributes = { "data-post-id": attrs.id };
    if (this.state.role) {
      attributes.role = this.state.role;
    }
    if (this.state["aria-label"]) {
      attributes["aria-label"] = this.state["aria-label"];
    }
    return attributes;
  },

  html(attrs, state) {
    attrs.embeddedPost = true;
    return [
      h("div.row", [
        this.attach("post-avatar", attrs),
        h("div.topic-body", [
          h("div.topic-meta-data.embedded-reply", [
            this.attach("poster-name", attrs),
            this.attach("post-link-arrow", {
              above: state.above,
              shareUrl: attrs.customShare,
            }),
          ]),
          new PostCooked(attrs, new DecoratorHelper(this), this.currentUser),
        ]),
      ]),
    ];
  },
});
