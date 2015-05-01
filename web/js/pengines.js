/*  Copyright (c) 2014, Torbjörn Lager
    All rights reserved.

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

    1. Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.

    2. Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in the
    documentation and/or other materials provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
    "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
    LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
    FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
    COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
    INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
    BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
    LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
    CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
    LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
    ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
    POSSIBILITY OF SUCH DAMAGE.
*/

		 /*******************************
		 *	    CONSTRUCTOR		*
		 *******************************/

function Pengine(options) {
  var that = this;

  // private functions
  function fillDefaultOptions(options) {
    for(var k in Pengine.options) {
      if ( Pengine.options.hasOwnProperty(k) &&
	   options[k] === undefined )
	options[k] = Pengine.options[k];
    }

    return options;
  }

  function copyOptions(to, from, list) {
    for(var i=0; i<list.length; i++) {
      var k = list[i];
      if ( from[k] !== undefined )
	to[k] = from[k];
    }
  }

  // create instance
  this.options = fillDefaultOptions(options);
  this.id = null;

  // On creation
  var src = this.options.src ? [this.options.src] : [];
  var createOptions = {
    src_text: this.script_sources(src).join('\n')
  };

  copyOptions(createOptions, options,
	      [ "format",
		"application",
		"ask",
		"template",
		"chunk",
		"destroy"
	      ]);

  $.ajax(this.options.server + '/create',
	 { contentType: "application/json; charset=utf-8",
	   dataType: "json",
	   data: JSON.stringify(createOptions),
	   type: "POST",
	   success: function(obj) {
	     that.process_response(obj);
	   },
	   error: function(jqXHR) {
	     var obj = { event:"error", pengine:that };

	     if ( jqXHR.responseText ) {
	       var msg = jqXHR.responseText.replace(/[^]*<body[^>]*>/, "")
					   .replace(/<\/body>/, "");
	       var plain = $("<div></div>").html(msg).text();
	       obj.data = plain;
	       obj.dataHTML = msg;
	     }

	     that.process_response(obj);
	   }
	 });

}/*end of Pengine()*/


		 /*******************************
		 *	     METHODS		*
		 *******************************/

(function() {
Pengine.ids = [];

Pengine.options = {
  format: "json",
  server: "/pengine"
};


Pengine.prototype.ask = function(query, options) {
  this.send('ask((' + query + '), ' + options_to_list(options) + ')');
};

Pengine.prototype.next = function(n) {
  if ( n === undefined )
    this.send('next');
  else
    this.send('next('+n+')');
};

Pengine.prototype.stop = function() {
  this.send('stop');
};

Pengine.prototype.respond = function(input) {
  this.send('input((' + input + '))');
};

/**
 * Process the reply to a `pull_response`.  If the last answer was
 * final, this question will be asked to a death pengine.  We do not
 * consider this an error.
 */
Pengine.prototype.pull_response = function(id) {
  var pengine = this;

  $.get(this.options.server + '/pull_response',
	{ id: this.id,
	  format: this.options.format
	},
	function(obj) {
	  if ( obj.event !== 'died')
	    pengine.process_response(obj);
	});
};

Pengine.prototype.abort = function() {
  var pengine = this;

  $.get(this.options.server + '/abort',
	{ id: this.id,
	  format: this.options.format
	},
	function(obj) {
	  pengine.process_response(obj);
	});
};

Pengine.prototype.destroy = function() {
  if ( !this.died )
    this.send('destroy');
};

// internal methods

Pengine.prototype.send = function(event) {
  pengine = this;

  $.get(pengine.options.server + '/send',
	{ id: this.id,
	  event: event,
	  format: this.options.format
	},
	function(obj) {
	  pengine.process_response(obj);
	});
};

Pengine.prototype.script_sources = function(src) {
  var scripts = document.getElementsByTagName('script');

  src = src||[];
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].getAttribute('type') == 'text/x-prolog') {
      src.push(scripts[i].textContent);
    }
  }

  return src;
};

Pengine.prototype.process_response = function(obj) {
  obj.pengine = this;
  Pengine.onresponse[obj.event].call(this, obj);
};

Pengine.prototype.callback = function(f, obj) {
  if ( this.options[f] )
  { this.options[f].call(obj, obj);
    return true;
  }
};

Pengine.prototype.report = function(level, data) {
  if ( console !== undefined )
    console[level](data);
  else if ( level === 'error' )
    alert(data);
};


		 /*******************************
		 *	  HANDLE EVENTS		*
		 *******************************/

Pengine.onresponse = {
  create: function(obj) {
    this.id = obj.id;
    Pengine.ids.push(obj.id);

    if ( Pengine.ids.length > obj.slave_limit ) {
      this.destroy();
      obj.data = "Attempt to create too many pengines. "+
		 "The limit is: " + obj.slave_limit;
      obj.code = "too_many_pengines";
      if ( !this.callback('onerror', obj) )
	this.report('error', obj.data);
    } else {
      this.callback('oncreate', obj);
      if ( obj.answer )
	this.process_response(obj.answer);
    }
  },

  stop:    function(obj) { this.callback('onstop',    obj); },
  success: function(obj) { this.callback('onsuccess', obj); },
  failure: function(obj) { this.callback('onfailure', obj); },
  prompt:  function(obj) { this.callback('onprompt',  obj); },

  error: function(obj) {
    if ( obj.code == "existence_error" &&
	 obj.arg1 == "pengine" &&
	 obj.arg2 == this.id )
      unregisterPengine(this);

    if ( !this.callback('onerror', obj) )
      this.report('error', obj.data);
  },

  output: function(obj) {
    this.callback('onoutput', obj);
    this.pull_response(obj.id);
  },

  debug: function(obj) {
    if ( !this.callback('ondebug', obj) )
      this.report('log', obj.data);
    this.pull_response(obj.id);
  },

  abort: function(obj) {
    this.aborted = true;
    this.callback('onabort', obj);
  },

  destroy: function(obj) {
    unregisterPengine(this);
    if ( obj.data )
      this.process_response(obj.data);
    this.callback('ondestroy', obj);
  },

  died: function(obj) {
    unregisterPengine(this);
    if ( !this.aborted ) {
      obj.data = "Pengine has died";
      obj.code = "died";
      if ( !this.callback('onerror', obj) )
	this.report('error', obj.data);
    }
  }
};


		 /*******************************
		 *	PRIVATE FUNCTIONS	*
		 *******************************/

function unregisterPengine(pengine) {
  var index = Pengine.ids.indexOf(pengine.id);
  if ( index > -1 ) Pengine.ids.splice(index, 1);
  pengine.died = true;
}

/**
 * Turn an object into a Prolog option list.  The option values
 * must be valid Prolog syntax.  Use Pengine.stringify() when
 * applicable.
 */
function options_to_list(options) {
  var opts = "[";
  for (var name in options) {
    if ( opts !== "[" )
      opts += ",";
    if ( options.hasOwnProperty(name) ) {
      opts += name + "(" + options[name] + ")";
    }
  }
  return opts + "]";
}

})();

/**
 * Serialize JavaScript data as a Prolog term.  The serialization
 * is performed according to the rules below:
 *
 *   - A number is serialized trivially
 *	 - A string is serialized into a Prolog string unless
 *	   `option.string == "atom"`
 *   - An array is serialized into a Prolog list
 *   - An object is serialized into a Prolog dict.  Keys that are
 *     integers are mapped to Prolog integers, other keys are mapped
 *     to Prolog atoms.  Note that in JavaScript {1:42} and {"1":42}
 *     are equavalent and both can be retrieved as either
 *     obj[1] or obj["1"]
 *
 * @param  {any} data is the data to be serialized
 * @param  {Object} [options]
 * @param {String} [options.string] If `"atom"`, translate
 * JavaScript strings into Prolog objects.
 * @return {String|undefined} is the Prolog serialization of `data`
 */

Pengine.stringify = function(data, options) {
  var msg  = "";
  var strq = options && options.string == "atom" ? "'" : '"';

  function serialize(data) {
    function stringEscape(s, q) {
      function dec2unicode(i)
      { var r;
	if      (i >= 0    && i <= 15)    { r = "\\u000" + i.toString(16); }
	else if (i >= 16   && i <= 255)   { r = "\\u00"  + i.toString(16); }
	else if (i >= 256  && i <= 4095)  { r = "\\u0"   + i.toString(16); }
	else if (i >= 4096 && i <= 65535) { r = "\\u"    + i.toString(16); }
	return r
      }

      var result = q;
      for(var i=0; i<s.length; i++) {
	var c = s.charAt(i);
	if ( c >= ' ' ) {
	       if ( c == '\\' ) result += "\\\\";
	  else if ( c ==   q  ) result += "\\"+q;
	  else result += c;
	} else {
	       if ( c == '\n' ) result += "\\n";
	  else if ( c == '\r' ) result += "\\r";
	  else if ( c == '\t' ) result += "\\t";
	  else if ( c == '\b' ) result += "\\b";
	  else if ( c == '\f' ) result += "\\f";
	  else result += dec2unicode(c.charCodeAt(0));
	}
      }
      return result+q;
    }

    function serializeKey(k) {
      if ( k.match(/^\d+$/) ) {
	msg += k;
      } else {
	msg += stringEscape(k, "'");
      }

      return true;
    }

    switch ( typeof(data) ) {
      case "number":
	msg += data;
	break;
      case "string":
	msg += stringEscape(data, strq);
	break;
      case "object":
	if ( Array.isArray(data) ) {
	  msg += "[";
	  for(var i=0; i<data.length; i++) {
	    if ( !serialize(data[i]) )
	      return false;
	    if ( i+1 < data.length )
	      msg += ",";
	  }
	  msg += "]";
	} else {
	  var first = true;
	  msg += "js{";
	  for(var p in data) {
	    if ( data.hasOwnProperty(p) ) {
	      if ( !first )
		msg += ",";
	      else
		first = false;
	      if ( !serializeKey(p) )
		return false;
	      msg += ":";
	      if ( !serialize(data[p]) )
		return false;
	    }
	  }
	  msg += "}";
	}
	break;
      default:
	return false;
    }

    return true;
  }

  if ( serialize(data) )
    return msg;
}/*end of Pengine.stringify*/


		 /*******************************
		 *	    DESTRUCTION		*
		 *******************************/

Pengine.destroy_all = function(async) {
  if ( Pengine.ids.length > 0 ) {
    $.ajax({ url:server + '/destroy_all?ids=' + Pengine.ids,
	     async: async === undefined ? true : false
           });
    Pengine.ids = [];
  }
};

window.onunload = function() {
    try {
        Pengine.destroy_all();
    } catch(e) {}
};
