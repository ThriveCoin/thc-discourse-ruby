__PrettyText = require("pretty-text/pretty-text").default;
__buildOptions = require("pretty-text/pretty-text").buildOptions;
__performEmojiUnescape = require("pretty-text/emoji").performEmojiUnescape;
__emojiReplacementRegex = require("pretty-text/emoji").emojiReplacementRegex;
__performEmojiEscape = require("pretty-text/emoji").performEmojiEscape;
__resetTranslationTree = require("pretty-text/engines/discourse-markdown/emoji")
  .resetTranslationTree;

I18n = {
  t(a, b) {
    return __helpers.t(a, b);
  },
};

define("I18n", ["exports"], function (exports) {
  exports.default = I18n;
});

// Formatting doesn't currently need any helper context
define("discourse-common/lib/helpers", ["exports"], function (exports) {
  exports.helperContext = function () {
    return {};
  };
});

__utils = require("discourse/lib/utilities");

__emojiUnicodeReplacer = null;

__setUnicode = function (replacements) {
  const regexp = new RegExp(__emojiReplacementRegex, "g");

  __emojiUnicodeReplacer = function (text) {
    regexp.lastIndex = 0;

    let m;
    while ((m = regexp.exec(text)) !== null) {
      let match = m[0];

      let replacement = replacements[match];

      if (!replacement) {
        // if we can't find replacement for an emoji match
        // attempts to look for the same without trailing variation selector
        match = match.replace(/\ufe0f$/g, "");
        replacement = replacements[match];
      }

      if (!replacement) {
        continue;
      }

      replacement = ":" + replacement + ":";
      const before = text.charAt(m.index - 1);
      if (!/\B/.test(before)) {
        replacement = "\u200b" + replacement;
      }
      text = text.replace(match, replacement);
    }

    // fixes Safari VARIATION SELECTOR-16 issue with some emojis
    // https://meta.discourse.org/t/emojis-selected-on-ios-displaying-additional-rectangles/86132
    text = text.replace(/\ufe0f/g, "");

    return text;
  };
};

__paths = {};

function __getURLNoCDN(url) {
  if (!url) {
    return url;
  }

  // if it's a non relative URL, return it.
  if (url !== "/" && !/^\/[^\/]/.test(url)) {
    return url;
  }

  if (url.indexOf(__paths.baseUri) !== -1) {
    return url;
  }
  if (url[0] !== "/") {
    url = "/" + url;
  }

  return __paths.baseUri + url;
}

function __getURL(url) {
  url = __getURLNoCDN(url);
  // only relative urls
  if (__paths.CDN && /^\\\/[^\\\/]/.test(url)) {
    url = __paths.CDN + url;
  } else if (__paths.S3CDN) {
    url = url.replace(__paths.S3BaseUrl, __paths.S3CDN);
  }
  return url;
}

function __lookupUploadUrls(urls) {
  return __helpers.lookup_upload_urls(urls);
}

function __getTopicInfo(i) {
  return __helpers.get_topic_info(i);
}

function __categoryLookup(c) {
  return __helpers.category_tag_hashtag_lookup(c);
}

function __lookupAvatar(p) {
  return __utils.avatarImg(
    { size: "tiny", avatarTemplate: __helpers.avatar_template(p) },
    __getURL
  );
}

function __formatUsername(username) {
  return __helpers.format_username(username);
}

function __lookupPrimaryUserGroup(username) {
  return __helpers.lookup_primary_user_group(username);
}

function __getCurrentUser(userId) {
  return __helpers.get_current_user(userId);
}
