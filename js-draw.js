"use strict";

// Code elements.
{
  // Variable
  {
    // Variable type can hold a list of variables, or a value.
    var Variable = function(region, parent) {
      this.region = region;
      this.mother = parent;
      this.variables = [];
      this.froms = [];
      this.tos = [];
      this.last_to = -1;
      this.is_atomic = true;
      this.name = IntToWord(region);
      this.computed = false;
    };
    Variable.prototype.AddVariable = function(region_idx) {
      this.is_atomic = false;
      this.variables.push(region_idx);
    };
    Variable.prototype.SetValue = function(value) {
      this.is_atomic = true;
      this.value = value;
    };
    Variable.prototype.AddFrom = function(from, link_bounds) {
      this.froms.push({node: from, bounds: link_bounds});
    };
    Variable.prototype.AddTo = function(to, link_bounds) {
      var last_to_flag = false;
      for (var i = 0; i != this.froms.length; i++) {
        if (IntersectsRect(stroke_start, this.froms[i].bounds)) {
          last_to_flag = true;
          break;
        }
      }
      if (last_to_flag) {
        this.last_to = to;
      } else {
        this.tos.push({node: to, bounds: link_bounds});
      }
    };
  }

  // Scope
  {
    // Scope type can have sub scopes and variables.
    var Scope = function(region, parent) {
      this.region = region;
      this.mother = parent;
      this.sub_scopes = [];
      this.variables = [];
      this.key_symbols = [];
      this.froms = [];
      this.tos = [];
      // Returns or follow-throughs.
      this.last_to = -1;
      this.start = -1;
      this.name = IntToWord(region);
      this.computed = false;
    };
    Scope.prototype.AddVariable = function(region_idx) {
      this.variables.push(region_idx);
    };
    Scope.prototype.AddSubScope = function(region_idx) {
      this.sub_scopes.push(region_idx);
    };
    Scope.prototype.AddKeySymbol = function(region_idx) {
      this.key_symbols.push(region_idx);
    };
    Scope.prototype.AddFrom = function(from, link_bounds) {
      this.froms.push({node: from, bounds: link_bounds});
    };
    Scope.prototype.AddTo = function(to, link_bounds) {
      var start_flag = false;
      for (var i = 0; i != this.sub_scopes.length; i++) {
        if (to == this.sub_scopes[i]) {
          start_flag = true;
          this.start = this.sub_scopes[i];
        }
      }
      if (start_flag) return;
      for (var i = 0; i != this.variables.length; i++) {
        if (to == this.variables[i]) {
          start_flag = true;
          this.start = this.variables[i];
        }
      }
      if (start_flag) return;
      
      var last_to_flag = false;
      for (var i = 0; i != this.froms.length; i++) {
        if (IntersectsRect(stroke_start, this.froms[i].bounds)) {
          last_to_flag = true;
          break;
        }
      }
      if (last_to_flag) {
        this.last_to = to;
      } else {
        this.tos.push({node: to, bounds: link_bounds});
      }
    };
  }
  
  // KeySymbol
  {
    var KeySymbol = function(region, parent) {
      this.region = region;
      this.mother = parent;
      this.type = "";
      this.froms = [];
      this.tos = [];
      this.last_to = -1;
      this.computed = false;
    };
    KeySymbol.prototype.SetValue = function(type) {
      this.type = type;
    };
    KeySymbol.prototype.AddFrom = function(from, link_bounds) {
      this.froms.push({node: from, bounds: link_bounds});
    };
    KeySymbol.prototype.AddTo = function(to, link_bounds) {
      var last_to_flag = false;
      for (var i = 0; i != this.froms.length; i++) {
        if (IntersectsRect(stroke_start, this.froms[i].bounds)) {
          last_to_flag = true;
          break;
        }
      }
      if (last_to_flag) {
        this.last_to = to;
      } else {
        this.tos.push({node: to, bounds: link_bounds});
      }
    };
  }
}

// Misc init.
{
  var canvas = document.querySelector('#paint_canvas');
  var context = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  context.lineWidth = 1;
  
  var mouse = {x: 0, y: 0};
  var last_mouse = {x: 0, y: 0};
  
  // 2D array of colors. JS canvas is very slow for random acces of pixels.
  // So every time we draw to the canvas, we also draw to the fake_canvas, so 
  // that we can query pixels much faster. Essential for floodfill.
  var fake_canvas = [];
  // 2D array of ints. Every pixel belongs to a region, identified by a unique int.
  // Used to identify which variable belongs to which scope etc.
  var regions = [];
  var region_count = 0;
  // Maps region ints to Scopes and Variables.
  var region_map = {};
  for (var i = 0; i != canvas.width; i++) {
    fake_canvas[i] = [];
    regions[i] = [];
    for (var j = 0; j != canvas.height; j++) {
      fake_canvas[i][j] = {r: 255, g: 255, b: 255, a: 255};
      regions[i][j] = 0;
    }
  }
  region_map[0] = new Scope(0);
  
  var untied_flows = [];
  
  var input_log = [];
}

// Code element creators
function MakeCode() {
  var functions = MakeFunctions();
  var full_code = "zero();\n" + functions;
  return full_code;
}
function Run() {
  eval(MakeCode());
}
function ShowCode() {
  document.getElementById('show_code_id').value = MakeCode();
}
function MakeFunctions() {
  var functions = {};
  var functions_string = "";
  for (var i = 0; i != region_count; i++) {
    if (region_map[i] instanceof Scope && (region_map[i].start != -1 || i == 0)) {
      var signature = "function " + region_map[i].name + "(";
      var args = [];
      for (var j = 0; j != region_map[i].froms.length; j++) {
        if (region_map[i].froms[j].node instanceof Variable) {
          args.push(region_map[i].froms[j].node);
          for (var k = 0; k != args.length; k++) {
            signature += "b";
          }
          signature += ", ";
        }
      }
      if (args.length > 0) signature = signature.substring(0, signature.length-2);
      signature += ") {\n";

      var node;
      if (region_map[i].start != -1) {
        node = region_map[i].start;
      } else {
        for (var j = 0; j != region_map[i].key_symbols.length; j++) {
          InferKeySymbolType(region_map[i].key_symbols[j]);
          if (region_map[i].key_symbols[j].type == "IN") {
            node = region_map[i].key_symbols[j];
            node.last_to = node.tos[0].node;
            break;
          }
        }
      }
      var function_body = ComputeFunctionBody(node);
      functions_string += signature + function_body + "\n}";
    }
  }
  return functions_string;
}
function ComputeFunctionBody(node) {
  var body = "";
  
  var main_chain = [];
  main_chain.push(node);
  FollowNodes(node.last_to, main_chain);
  
  for (var i = 0; i != main_chain.length; i++) {
    if (main_chain[i] instanceof Variable) {
      body += ComputeVariableDecl(main_chain[i], main_chain[i-1]);
    } else if (main_chain[i] instanceof KeySymbol) {
      body += ComputeKeySymbol(main_chain[i], main_chain[i-1]);
    }
  }
  
  return body;
}
function FollowNodes(node, chain) {
  chain.push(node);
  if (node.last_to == -1) return;
  FollowNodes(node.last_to, chain);
}
function ComputeVariableDecl(variable, activator) {
  if (variable.computed) return "";
  
  var decl = "";
  for (var i = 0; i != variable.froms.length; i++) {
    if (variable.froms[i].node instanceof Variable &&
        !variable.froms[i].node.computed) {
      decl += ComputeVariableDecl(variable.froms[i].node, activator);
    }
  }
  
  if (!isNaN(variable.value)) {
    variable.computed = true;
    return decl += "var " + variable.name + " = " + variable.value + "\n;";
  }
  
  if (variable.value.charAt(0) == '"' && 
      variable.value.charAt(variable.value.length) == '"') {
    variable.computed = true;
    return decl += "var " + variable.name + " = " + variable.value + ";\n";
  }
  
  var ops = ['+', '-', '*', '/', '&&', '||'];
  var op = false;
  for (var i = 0; i != ops.length; i++) {
    if (variable.value.indexOf(ops[i]) != -1) {
      op = true;
      break;
    }
  }
  
  if (!op) {
    variable.computed = true;
    return decl += "var " + variable.name + " = \"" + variable.value + "\";\n";
  }
  
  var operators = variable.value.split(" ");
  decl += "var " + variable.name + " = ";
  
  var sorted_froms = [];
  for (var i = 0; i != variable.froms.length; i++) {
    var least_x = 9999999;
    var least = -1;
    for (var j = 0; j != variable.froms.length; j++) {
      if (variable.froms[j].bounds.x < least_x) {
        least_x = variable.froms[j].bounds.x;
        least = j;
      }
    }
    
    for (var j = 0; j != variable.froms.length; j++) {
      console.log(variable.froms[j].node.name + " ");
    }
    
    sorted_froms.push(variable.froms[least]);
    variable.froms.splice(least, 1);
  }
  variable.froms = sorted_froms;
  
  for (var i = 0; i != variable.froms.length; i++) {
    decl += " " + variable.froms[i].node.name + " ";
    if (i != variable.froms.length -1) decl += operators[i];
  }
  decl += ";\n";
  variable.computed = true;
  return decl;
}
function InferKeySymbolType(key_symbol) {
  if (key_symbol.type == "") {
    if (key_symbol.froms.length == 0 && key_symbol.tos.length == 1) {
      key_symbol.type = "IN";
    } else if (key_symbol.froms.length > 0 && key_symbol.tos.length == 0) {
      key_symbol.type = "OUT";
    }
  }
}
function ComputeKeySymbol(key_symbol, activator) {
  var key_string = "";
  InferKeySymbolType(key_symbol);
  
  switch (key_symbol.type) {
    case "IN":
      key_string += "var " + key_symbol.tos[0].node.name + " = " +
                    "document.getElementById('input_console_id').value;\n";
      key_symbol.tos[0].node.computed = true;
      break;
    case "OUT":
      key_string += "document.getElementById('output_console_id').value += " +
                    activator.name + ";\n"
      break;
    case "GT":
    case ">":
      if (key_symbol.froms.length == 2 && key_symbol.tos.length == 2) {
        var enter_left, enter_right, exit_false, exit_true;
        if (key_symbol.froms[0].bounds.x < key_symbol.froms[1].bounds.x) {
          enter_left = key_symbol.froms[0];
          enter_right = key_symbol.froms[1];
        } else {
          enter_left = key_symbol.froms[1];
          enter_right = key_symbol.froms[0];
        }
      if (key_symbol.tos[0].bounds.x < key_symbol.tos[1].bounds.x) {
          exit_false = key_symbol.tos[0];
          exit_true = key_symbol.tos[1];
        } else {
          exit_false = key_symbol.tos[1];
          exit_true = key_symbol.tos[0];
        }
      }
      key_string += "if (" + enter_left.node.name + " > " + enter_right.node.name + ") {\n";
      key_string += ComputeFunctionBody(exit_true.node) + "} else {\n";
      key_string += ComputeFunctionBody(exit_false.node) + "}\n";
  }
  return key_string;
}

// Different colors for different code elements.
{
  var selected_stroke;
  var strokes = {};
  var strokes2 = {};
  strokes["Scope"] = "#000000";
  strokes["Flow"] = "#FF0000";
  strokes["Variable"] = "#00FF00";
  strokes["KeySymbol"] = "#0000FF";
  strokes["Comment"] = "#FFFF00";
  strokes2["Scope"] = {r: 0, g: 0, b: 0, a: 255};
  strokes2["Flow"] = {r: 255, g: 0, b: 0, a: 255};
  strokes2["Variable"] = {r: 0, g: 255, b: 0, a: 255};
  strokes2["KeySymbol"] = {r: 0, g: 0, b: 255, a: 255};
  strokes2["Comment"] = {r: 255, g: 255, b: 0, a: 255};
}

// Color helper functions.
function HexToRgba(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
        a: 255
    } : null;
}
function RgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function EqualsColor(a, b) {
  return a.r == b.r && a.g == b.g && a.b == b.b && a.a == b.a;
}

// Misc helper functions.
function IntersectsRect(point, rect) {
  if (point.x > rect.x && point.x < rect.x + rect.w &&
      point.y > rect.y && point.y < rect.y + rect.h) {
    return true;      
  }
  return false;
}
function IntToWord(int) {
  var word = "";
  var digits = (""+int).split("");
  for (var i = 0; i != digits.length; i++) {
    switch (digits[i]) {
      case "0": word += "zero"; break; case "1": word += "one"; break;
      case "2": word += "two"; break; case "3": word += "three"; break;
      case "4": word += "four"; break; case "5": word += "five"; break;
      case "6": word += "six"; break; case "7": word += "seven"; break;
      case "8": word += "eight"; break; case "9": word += "nine"; break;
    }  
  }
  return word;
}
function Contains(a, obj) {
    for (var i = 0; i < a.length; i++) {
        if (a[i] === obj) {
            return true;
        }
    }
    return false;
}
function Save() {
  var save = "";
  for (var i = 0; i != input_log.length; i++) {
    save += input_log[i].type + ",";
    switch (input_log[i].type) {
      case "Key":
        save += input_log[i].keycode + ",";
        save += input_log[i].mouse_x + "," + input_log[i].mouse_y + ";\n";
        break;
      case "Line":
        save += input_log[i].x0 + "," + input_log[i].y0 + "," + input_log[i].x1 + ","; 
        save += input_log[i].y1 + "," + input_log[i].color + "," + input_log[i].end + ";\n";
        break;
    }
  }
  document.getElementById('save_id').value = save;
}
function Load() {
  var save = document.getElementById('load_id').value;
  var load_input_log = save.split(";");
  var mouse_down_flag = false;
  for (var i = 0; i != load_input_log.length; i++) {
    var line = load_input_log[i].split(",");
    if (line[0].charAt(0) == '\n') {
      line[0] = line[0].substring(1, line[0].length)
    }
    switch (line[0]) {
      case "Key":
        mouse.x = parseInt(line[2]);
        mouse.y = parseInt(line[3]);
        HandleKeyboard(parseInt(line[1]), false);
        break;
      case "Line":
        mouse.x = parseInt(line[1]);
        mouse.y = parseInt(line[2]);
        if (mouse_down_flag) {
          stroke_start = {x: mouse.x, y: mouse.y};
        }
        last_mouse.x = parseInt(line[3]);
        last_mouse.y = parseInt(line[4]);
        selected_stroke = line[5];
        Bresenham();
        if (line[6] == "true") {
          canvas.dispatchEvent(new Event("mouseup"));
          mouse_down_flag = true;
        } else {
          mouse_down_flag = false; 
        }
        break;
    }
  }
}
function SetStroke(stroke) {
  selected_stroke = stroke;
}
function ShowFill() {
  for (var i = 0; i != canvas.width; i++) {
    for (var j = 0; j != canvas.height; j++) {
      if (!EqualsColor(fake_canvas[i][j], {r: 255, g: 255, b: 255, a: 255})) {
        SetColor(i, j, fake_canvas[i][j]); continue;
      }
    }
  }
  for (var i = 0; i != input_log.length; i++) {
    if (input_log[i].type == "Key") {
      mouse.x = input_log[i].mouse_x;
      mouse.y = input_log[i].mouse_y;
      HandleKeyboard(input_log[i].keycode, true);
    }
  }
}

var stroke_start;
canvas.addEventListener('mousedown', function(e) {
  context.beginPath();
  context.moveTo(mouse.x, mouse.y);
  stroke_start = {x: mouse.x, y: mouse.y};
  last_mouse = {x: mouse.x, y: mouse.y};
  canvas.addEventListener('mousemove', Bresenham, false);
}, false);
 
// Either draws a stroke or highlights a button.
canvas.addEventListener('mousemove', function(e) {
  last_mouse.x = mouse.x;
  last_mouse.y = mouse.y;
  mouse.x = e.pageX - this.offsetLeft;
  mouse.y = e.pageY - this.offsetTop;
  console.log(regions[mouse.x][mouse.y]);
}, false);
 
// Adds code elements based on the stroke made between mousedown and mouseup.
canvas.addEventListener('mouseup', function() {
  canvas.removeEventListener('mousemove', Bresenham, false);
  if (input_log.length > 0)
    input_log[input_log.length-1].end = true;
  
  // Both scope and variable cases will floodfill their enclosed region with
  // a unique region int.
  switch (selected_stroke) {
  case "Scope":  // Creates scope and adds it as a subscope to an existing scope
                 // if it is placed inside an existing scope.
    region_map[++region_count] = new Scope(
      region_count, region_map[regions[mouse.x][mouse.y]]);
    region_map[regions[mouse.x][mouse.y]].AddSubScope(region_map[region_count]);
    FloodFill(mouse.x, mouse.y, 
             {r: region_count*10 + 50, g: 0, b: 0, a: 255}, region_count);
    break;
  case "Variable":  // Creates variable and adds it to a scope, or a variable.
    region_map[++region_count] = new Variable(
      region_count, region_map[regions[mouse.x][mouse.y]]);
    region_map[regions[mouse.x][mouse.y]].AddVariable(region_map[region_count]);
    FloodFill(mouse.x, mouse.y, 
             {r: 0, g: region_count*10 + 50, b: 0, a: 255}, region_count);
    break;
  case "Flow":
    var end_rect = {x: mouse.x-4, y: mouse.y-4, w: 8, h: 8};
    SetColorRect(end_rect, strokes2["Flow"]);
    var start_region = regions[stroke_start.x][stroke_start.y];
    var end_region = regions[mouse.x][mouse.y];
    if (start_region > region_count || end_region > region_count ) {
      untied_flows.push({start: stroke_start, end: {x: mouse.x, y: mouse.y}});
      return;
    }
    region_map[start_region].AddTo(region_map[end_region], end_rect);
    region_map[end_region].AddFrom(region_map[start_region], end_rect);
    break;
  case "KeySymbol":
    region_map[++region_count] = new KeySymbol(
      region_count, region_map[regions[mouse.x][mouse.y]]);
    if (region_map[regions[mouse.x][mouse.y]] instanceof Scope) {
      region_map[regions[mouse.x][mouse.y]].AddKeySymbol(region_map[region_count]);
    }
    FloodFill(mouse.x, mouse.y, {r: 0, g: 0, b: region_count*20, a: 255}, region_count);
    break;
  }
}, false);

// Keyboard event handling.
var temp_value = "";  // Stores the string the user is typing, until enter is pressed.
var temp_value_coords;  // Stores the mouse position when user started typing.
window.onkeydown = function(e) {
  if (document.activeElement != document.body) return;
  var key = e.keyCode ? e.keyCode : e.which;
  if (key != 8) return true;

  HandleBackspace();
  return false;
};
window.onkeypress = function(e) {
  if (document.activeElement != document.body) return;
  var key = e.keyCode ? e.keyCode : e.which;
  console.log(key);

  HandleKeyboard(key, false);
  return true;
};

function HandleBackspace() {
  if (temp_value == "") return;
  var found_chars = 0;
  var iter = input_log.length-1;
  while (found_chars < temp_value.length) {
    if (input_log[iter].type == "Key") {
      input_log.splice(iter, 1);
      found_chars++;
    }
    iter--;
  }
  SetColorRectFill(
    {x: temp_value_coords.x, y: temp_value_coords.y-12,
     w: context.measureText(temp_value).width, h: 14},
    {r: 255, g: 255, b: 255, a: 255});
  temp_value = "";
}

function HandleKeyboard(key, only_for_show) {
  if (key != 13) { // enter
    // Types a string onto the canvas, saves the string in temp_value.
    if (!only_for_show)
      input_log.push({type: "Key", keycode: key, mouse_x: mouse.x, mouse_y: mouse.y});
    if (temp_value == "") {
      temp_value_coords = {x: mouse.x, y: mouse.y};
    }
    context.fillStyle = "#000000";
    context.fillText(String.fromCharCode(key), 
                     temp_value_coords.x + context.measureText(temp_value).width, 
                     temp_value_coords.y);
    temp_value += String.fromCharCode(key);
  } else {
    // Sets the value of the variable the mouse was over to temp_value.
    if (!only_for_show) {
      input_log.push({type: "Key", keycode: key, mouse_x: mouse.x, mouse_y: mouse.y});
      region_map[regions[temp_value_coords.x][temp_value_coords.y]].SetValue(temp_value);
    }
    temp_value = "";
  }
}

// Recursively searches for and prints values and scopes within a starting scope.
function IterScopes(scope, depth) {
  var tab = "";
  for (var i = 0; i != depth; i++) tab += "  ";
  console.log(tab += "SCOPE");
  for (var i = 0; i != scope.sub_scopes.length; i++) {
    IterScopes(scope.sub_scopes[i], depth + 1);
  }
  for (var i = 0; i != scope.variables.length; i++) {
    IterVars(scope.variables[i], depth + 1);
  }
}
function IterVars(variable, depth) {
  var tab = "";
  for (var i = 0; i != depth; i++) tab += "  ";
  if (!variable.is_atomic) {
    console.log(tab + "OBJECT");
    for (var i = 0; i != variable.variables.length; i++) {
      IterVars(variable.variables[i], depth + 1);
    }
  } else {
    console.log(tab + "VAR: " + variable.value); 
  }
}

// Draws a line on the canvas and the fake_canvas.
function Bresenham() {
  var x0 = mouse.x; var y0 = mouse.y;
  var x1 = last_mouse.x; var y1 = last_mouse.y;
  var color = HexToRgba(strokes[selected_stroke]);
  
  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  var dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  var err = (dx>dy ? dx : -dy)/2;
 
  input_log.push({type: "Line", x0: x0, y0: y0, x1: x1, y1: y1,
                  color: selected_stroke, end: false});
 
  while (true) {
    SetColor(x0, y0, color);
    fake_canvas[x0][y0] = color;
    if (x0 === x1 && y0 === y1) break;
    var e2 = err;
    if (e2 > -dx) { err -= dy; x0 += sx; }
    if (e2 < dy) { err += dx; y0 += sy; }
  }
}

// Sets a pixel on the canvas, and in the fake_canvas.
function SetColor(x, y, rgba) {
  var data = new Uint8ClampedArray(4);
  data[0] = rgba.r; data[1] = rgba.g; data[2] = rgba.b; data[3] = rgba.a;
  var new_pixel = new ImageData(data, 1, 1);
  context.putImageData(new_pixel, x, y);
  fake_canvas[x][y] = rgba;
}

function SetColorRect(rect, rgba) {
  for (var i = rect.x; i != rect.x + rect.w; i++) {
    for (var j = rect.y; j != rect.y + rect.h; j++) {
      if (i == rect.x || j == rect.y || 
          i == rect.x + rect.w-1 || j == rect.y + rect.h-1) 
        SetColor(i, j, rgba);  
    }
  }
}

function SetColorRectFill(rect, rgba) {
  for (var i = rect.x; i != rect.x + rect.w; i++) {
    for (var j = rect.y; j != rect.y + rect.h; j++) {
      SetColor(i, j, rgba);  
    }
  }
}

// Calls FloodFillInternal with the entire canvas as rect.
function FloodFill(x, y, desired_color, region) {
  FloodFillInternal(
    x, y, {x: 0, y: 0, w: canvas.width, h: canvas.height}, desired_color, region);
}

// Starting at {x, y}, flood fill all pixels that fall within the bounding box
// rect with the color desired_color and the int region.
function FloodFillInternal(x, y, rect, desired_color, region) {
  var target_color = fake_canvas[x][y+1];
  SetColor(mouse.x, mouse.y, target_color);
  SetColor(last_mouse.x, last_mouse.y, target_color);
  if (EqualsColor(target_color, desired_color)) {
    return;
  }
  var processed = [];
  for (var i = 0; i != rect.w; i++) {
    processed[i + rect.x] = [];
    for (var j = 0; j != rect.h; j++) {
      processed[i + rect.x][j + rect.y] = 0;
    }
  }
  var queue = [];
  queue.push({x: x, y: y, color: target_color});
  var c = 0;
  while (queue.length > 0) {
    if (c > canvas.width * canvas.height) break; else c++;
    var n = queue.pop();
    if (EqualsColor(n.color, target_color)) {
      fake_canvas[n.x][n.y] = desired_color;
      regions[n.x][n.y] = region;
      if (n.x > 0 && processed[n.x-1][n.y] == 0) {
        processed[n.x-1][n.y] = 1;
        var color1 = fake_canvas[n.x-1][n.y];
        queue.push({x: n.x-1, y: n.y, color: color1});
      }
      if (n.y > 0 && processed[n.x][n.y-1] == 0) {
        processed[n.x][n.y-1] = 1;
        var color2 = fake_canvas[n.x][n.y-1];
        queue.push({x: n.x, y: n.y-1, color: color2});
      }
      if (n.x + 1 < canvas.width && processed[n.x+1][n.y] == 0) {
        processed[n.x+1][n.y] = 1;
        var color3 = fake_canvas[n.x+1][n.y];
        queue.push({x: n.x+1, y: n.y, color: color3});
      }
      if (n.y + 1 < canvas.height && processed[n.x][n.y+1] == 0) {
        processed[n.x][n.y+1] = 1;
        var color4 = fake_canvas[n.x][n.y+1];
        queue.push({x: n.x, y: n.y+1, color: color4});
      }
    }
  }
}