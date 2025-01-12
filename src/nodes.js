/**
 * See https://prosemirror.net/docs/ref/#model.NodeSpec
 */
export const mentionNode = {
  group: "inline",
  inline: true,
  atom: true,

  attrs: {
    did: "",
    handle: ""
  },

  selectable: false,
  draggable: false,

  toDOM: node => {
    return [
      "span",
      {
        "data-mention-did": node.attrs.did,
        "data-mention-handle": node.attrs.handle,
        class: "prosemirror-mention-node"
      },
      "@" + node.attrs.handle //|| node.attrs.email
    ];
  },

  parseDOM: [
    {
      // match tag with following CSS Selector
      tag: "span[data-mention-did][data-mention-handle]",

      getAttrs: dom => {
        var did = dom.getAttribute("data-mention-did");
        var handle = dom.getAttribute("data-mention-handle");
        return { did, handle };
      }
    }
  ]
};

/**
 * See https://prosemirror.net/docs/ref/#model.NodeSpec
 */
export const tagNode = {
  group: "inline",
  inline: true,
  atom: true,

  attrs: {
    tag: ""
  },

  selectable: false,
  draggable: false,

  toDOM: node => {
    return [
      "span",
      {
        "data-tag": node.attrs.tag,
        class: "prosemirror-tag-node"
      },
      "#" + node.attrs.tag
    ];
  },

  parseDOM: [
    {
      // match tag with following CSS Selector
      tag: "span[data-tag]",

      getAttrs: dom => {
        var tag = dom.getAttribute("data-tag");
        return {
          tag: tag
        };
      }
    }
  ]
};
