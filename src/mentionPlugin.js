import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/**
 *
 * @param {String} mentionTrigger
 * @param {String} hashtagTrigger
 * @param {bool} allowSpace
 * @param {bool} requireText
 * @returns {Object}
 */
export function getRegexp(mentionTrigger, hashtagTrigger, allowSpace, requireText) {
  var textOperator = requireText ? '+' : '*';

  var mention = allowSpace
    ? new RegExp("(^|\\s)" + mentionTrigger + "([\\w-\\+]" + textOperator + "\\s?[\\w-\\+]*)$")
    : new RegExp("(^|\\s)" + mentionTrigger + "([\\w-\\+]" + textOperator + ")$");

  // hashtags should never allow spaces. I mean, what's the point of allowing spaces in hashtags?
  var tag = new RegExp("(^|\\s)" + hashtagTrigger + "([\\w-]+)$");

  return {
    mention: mention,
    tag: tag
  };
}

/**
 *
 * @param {ResolvedPosition} $position https://prosemirror.net/docs/ref/#model.Resolved_Positions
 * @param {JSONObject} opts
 * @returns {JSONObject}
 */
export function getMatch($position, opts) {
  // take current para text content upto cursor start.
  // this makes the regex simpler and parsing the matches easier.
  var parastart = $position.before();
  const text = $position.doc.textBetween(parastart, $position.pos, "\n", "\0");

  var regex = getRegexp(
    opts.mentionTrigger,
    opts.hashtagTrigger,
    opts.allowSpace,
    opts.requireText
  );

  // only one of the below matches will be true.
  var mentionMatch = text.match(regex.mention);
  var tagMatch = text.match(regex.tag);

  var match = mentionMatch || tagMatch;

  // set type of match
  var type;
  if (mentionMatch) {
    type = "mention";
  } else if (tagMatch) {
    type = "tag";
  }

  // if match found, return match with useful information.
  if (match) {
    // adjust match.index to remove the matched extra space
    match.index = match[0].startsWith(" ") ? match.index + 1 : match.index;
    match[0] = match[0].startsWith(" ")
      ? match[0].substring(1, match[0].length)
      : match[0];

    // The absolute position of the match in the document
    var from = $position.start() + match.index;
    var to = from + match[0].length;

    var queryText = match[2];

    return {
      range: { from: from, to: to },
      queryText: queryText,
      type: type
    };
  }
  // else if no match don't return anything.
}

/**
 * Util to debounce call to a function.
 * >>> debounce(function(){}, 1000, this)
 */
export const debounce = (function() {
  var timeoutId = null;
  return function(func, timeout, context) {
    context = context || this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(function() {
      func.apply(context, arguments);
    }, timeout);

    return timeoutId;
  };
})();

var getNewState = function() {
  return {
    active: false,
    range: {
      from: 0,
      to: 0
    },
    type: "", //mention or tag
    text: "",
  };
};
/**
 * Default options
 * @template {HTMLElement} DropdownEl
 * @template SuggestionItem
 * */
var defaultOpts = {
  mentionTrigger: "@",
  hashtagTrigger: "#",
  allowSpace: true,
  requireText: false,
  /** @returns {DropdownEl} */
  createDropdownEl: () => document.createElement('div'),
  /** @param {DropdownEl} dropdownEl @param {SuggestionItem[]} suggestionItems */
  showDropdownEl: (dropdownEl, suggestionItems, opts) => null,
  /** @param {DropdownEl} dropdownEl */
  hideDropdownEl: (dropdownEl, opts) => null,
  /** @param {(suggestionItems: SuggestionItem) => void} callWhenDone */
  getSuggestions: (type, text, callWhenDone) => callWhenDone(),
  /** @param {DropdownEl} dropdownEl */
  goNext: (dropdownEl, opts) => null,
  /** @param {DropdownEl} dropdownEl */
  goPrev: (dropdownEl, opts) => null,
  /** @param {DropdownEl} dropdownEl */
  getCurItemAttrsForSelect: (dropdownEl, opts) => null,
  /** @param {DropdownEl} dropdownEl */
  destroy: (dropdownEl) => null,
  activeClass: "suggestion-item-active",
  suggestionTextClass: "prosemirror-suggestion",
  maxNoOfSuggestions: 10,
  delay: 500
};

/**
 * @param {typeof defaultOpts} options
 * @returns {Plugin}
 */
export function getMentionsPlugin( options ) {

  /** @type {typeof defaultOpts} */
  const opts = Object.assign({}, defaultOpts, options);

  // timeoutId for clearing debounced calls
  var showListTimeoutId = null;

  /** dropdown element */
  var el = opts.createDropdownEl(),
  elAddedToBody = false;

  // ----- methods operating on above properties -----

  /** @param {any[]} [suggestionItems] */
  var showList = function(view, state, suggestionItems, opts) {

    // get current @mention span left and top.
    // TODO: knock off domAtPos usage. It's not documented and is not officially a public API.
    // It's used currently, only to optimize the the query for textDOM
    var node = view.domAtPos(view.state.selection.$from.pos);
    var paraDOM = node.node;
    var textDOM = paraDOM.querySelector("." + opts.suggestionTextClass);

    // TODO: should add null check case for textDOM
    var offset = textDOM.getBoundingClientRect();

    // TODO: think about outsourcing this positioning logic as options
    if( !elAddedToBody ) {
      elAddedToBody = true;
      document.body.appendChild(el);
    }
    el.style.position = "fixed";
    el.style.left = offset.left + "px";

    var top = textDOM.offsetHeight + offset.top;
    el.style.top = top + "px";
    el.style.display = "block";
    el.style.zIndex = "999999";
    opts.showDropdownEl( el, suggestionItems, opts );
  };

  var hideList = function() {
    el.style.display = "none";
    opts.hideDropdownEl( el, opts );
  };

  /** @param {typeof defaultOpts} opts */
  var select = function(view, state, opts) {
    const attrs = opts.getCurItemAttrsForSelect( el, opts );
    if( attrs ) {
      var node = view.state.schema.nodes[state.type].create(attrs);
      var tr = view.state.tr.replaceWith(state.range.from, state.range.to, node);
  
      //var newState = view.state.apply(tr);
      //view.updateState(newState);
      view.dispatch(tr);
    }
  };

  /**
   * See https://prosemirror.net/docs/ref/#state.Plugin_System
   * for the plugin properties spec.
   */
  return new Plugin({
    key: new PluginKey("autosuggestions"),

    // we will need state to track if suggestion dropdown is currently active or not
    state: {
      init() {
        return getNewState();
      },

      apply(tr, state) {
        // compute state.active for current transaction and return
        var newState = getNewState();
        var selection = tr.selection;
        if (selection.from !== selection.to) {
          return newState;
        }

        const $position = selection.$from;
        const match = getMatch($position, opts);

        // if match found update state
        if (match) {
          newState.active = true;
          newState.range = match.range;
          newState.type = match.type;
          newState.text = match.queryText;
        }

        return newState;
      }
    },

    // We'll need props to hi-jack keydown/keyup & enter events when suggestion dropdown
    // is active.
    props: {
      handleKeyDown(view, e) {
        var state = this.getState(view.state);

        // don't handle if not in active mode
        if( !state.active ) return false;

        // if any of the below keys, override with custom handlers.
        var down, up, enter, esc;
        enter = e.keyCode === 13;
        down = e.keyCode === 40;
        up = e.keyCode === 38;
        esc = e.keyCode === 27;

        if( down ) {
          opts.goNext( el, opts );
          return true;
        } else if (up) {
          opts.goPrev( el, opts );
          return true;
        } else if( enter ) {
          select(view, state, opts);
          return true;
        } else if (esc) {
          clearTimeout(showListTimeoutId);
          hideList();
          this.state = getNewState();
          return true;
        } else {
          // didn't handle. handover to prosemirror for handling.
          return false;
        }
      },

      // to decorate the currently active @mention text in ui
      decorations(editorState) {
        const { active, range } = this.getState(editorState);

        if (!active) return null;

        return DecorationSet.create(editorState.doc, [
          Decoration.inline(range.from, range.to, {
            nodeName: "span",
            class: opts.suggestionTextClass
          })
        ]);
      }
    },

    // To track down state mutations and add dropdown reactions
    view() {
      return {
        update: view => {
          var state = this.key.getState(view.state);
          if( !state.active || (opts.requireText && !state.text) ) {
            hideList();
            clearTimeout(showListTimeoutId);
            return;
          }
          // debounce the call to avoid multiple requests
          showListTimeoutId = debounce(
            function() {
              // get suggestions
              opts.getSuggestions(state.type, state.text, function callWhenDone( suggestionItems ) {
                showList(view, state, suggestionItems, opts);
              });
            },
            opts.delay,
            this
          );
        },
        destroy: () => {
          // remove the dropdown el
          el.remove();
          opts.destroy( el );
        }
      };
    }
  });
}
