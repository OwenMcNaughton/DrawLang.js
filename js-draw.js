"use strict";

// Code elements.
{
  // Variable type can hold a list of variables, or a value.
  var Variable = function(region) {
    this.region = region;
    this.variables = [];
    this.is_atomic = true;
  };
  Variable.prototype.AddVariable = function(region_idx) {
    this.is_atomic = false;
    this.variables.push(region_idx);
  };
  Variable.prototype.SetValue = function(value) {
    this.is_atomic = true;
    this.value = value;
  };
  
  // Scope type can have sub scopes and variables.
  var Scope = function(region) {
    this.region = region;
    this.sub_scopes = [];
    this.variables = [];
  };
  Scope.prototype.AddVariable = function(region_idx) {
    this.variables.push(region_idx);
  };
  Scope.prototype.AddSubScope = function(region_idx) {
    this.sub_scopes.push(region_idx);
  };
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
}

// Different colors for different code elements.
{
  var selected_stroke;
  var strokes = {};
  strokes["Scope"] = "#000000";
  strokes["Flow"] = "#FF0000";
  strokes["Variable"] = "#00FF00";
  strokes["Arse"] = "#0000FF";
  strokes["Comments"] = "#FFFF00";
}

// Adds stroke style buttons and draws them.
var buttons = {};
{
  // Call it a buffon to avoid any ambiguity with existing JS button stuff.
  class Buffon {
    constructor(x, y, text, back_color, text_color, font) {
      this.rect = {x: x, y: y, w: context.measureText(text).width, h: 20};
      this.text = text;
      this.back_color = back_color;
      this.text_color = text_color;
      this.font = font;
      this.text_x = (this.rect.w - context.measureText(text).width) / 2;
      this.offset = {x: 0, y: 0};
    }
    
    draw() {
      context.font = this.font;
      context.fillStyle = this.back_color;
      this.rect.w = context.measureText(this.text).width + 8;
      context.fillRect(this.rect.x + this.offset.x, this.rect.y + this.offset.y, 
                       this.rect.w, this.rect.h);
      context.fillStyle = this.text_color;
      context.fillText(this.text, this.text_x + 4 + this.offset.x,
                       this.rect.y + 14 + this.offset.y);
    }
    
    highlight() {
      if (MouseIntersectsRect(this.rect)) {
        context.beginPath();
        context.lineWidth = "2";
        context.strokeStyle = "#FFFFFF";
        context.rect(this.rect.x, this.rect.y+1, this.rect.w-1, this.rect.h-2);
        context.stroke();
        return true;
      } else {
        this.draw();
        return false;
      }
    }
    
    select() {
      if (MouseIntersectsRect(this.rect)) {
        return true;
      } else {
        return false;
      }
    }
  }
  
  buttons["Scope"] = new Buffon(
    0, 0, "Scope", strokes["Scope"], "#FFFFFF", "12px Arial");
  buttons["Flow"] = new Buffon(
    0, 25, "Flow", strokes["Flow"], "#FFFFFF", "12px Arial");
  buttons["Variable"] = new Buffon(
    0, 50, "Variable", strokes["Variable"], "#000000", "12px Arial");
  buttons["Arse"] = new Buffon(
    0, 75, "Arse", strokes["Arse"], "#FFFFFF", "12px Arial");
  buttons["Comments"] = new Buffon(
    0, 100, "Comments", strokes["Comments"], "#000000", "12px Arial");
  for (var key in buttons) {
    if (buttons.hasOwnProperty(key)) {
      buttons[key].draw();
    }
  }
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
function MouseIntersectsRect(rect) {
  if (mouse.x > rect.x && mouse.x < rect.x + rect.w &&
      mouse.y > rect.y && mouse.y < rect.y + rect.h) {
    return true;      
  }
  return false;
}

// Either clicks on buttons or sets up line drawing.
var button_clicked = false;
canvas.addEventListener('mousedown', function(e) {
  for (var key in buttons) {
    if (buttons.hasOwnProperty(key)) {
      if (buttons[key].select()) {
        selected_stroke = key;
        console.log(key);
        button_clicked = true;
        return;
      }
    }
  }
  button_clicked = false;
  
  context.beginPath();
  context.moveTo(mouse.x, mouse.y);
  last_mouse = {x: mouse.x, y: mouse.y};
  canvas.addEventListener('mousemove', Bresenham, false);
}, false);
 
// Either draws a stroke or highlights a button.
canvas.addEventListener('mousemove', function(e) {
  last_mouse.x = mouse.x;
  last_mouse.y = mouse.y;
  mouse.x = e.pageX - this.offsetLeft;
  mouse.y = e.pageY - this.offsetTop;
  
  for (var key in buttons) {
    if (buttons.hasOwnProperty(key)) {
      buttons[key].highlight();
    }
  }
}, false);
 
// Adds code elements based on the stroke made between mousedown and mouseup.
canvas.addEventListener('mouseup', function() {
  if (button_clicked) return;
  
  canvas.removeEventListener('mousemove', Bresenham, false);
  
  // Both scope and variable cases will floodfill their enclosed region with
  // a unique region int.
  switch (selected_stroke) {
  case "Scope":  // Creates scope and adds it as a subscope to an existing scope
                 // if it is placed inside an existing scope.
    region_map[++region_count] = new Scope(region_count);
    region_map[regions[mouse.x][mouse.y]].AddSubScope(region_map[region_count]);
    FloodFill(mouse.x, mouse.y, {r: region_count*20, g: 0, b: 0, a: 255}, region_count);
    break;
  case "Variable":  // Creates variable and adds it to a scope, or a variable.
    region_map[++region_count] = new Variable(region_count);
    region_map[regions[mouse.x][mouse.y]].AddVariable(region_map[region_count]);
    FloodFill(mouse.x, mouse.y, {r: 0, g: region_count*20, b: 0, a: 255}, region_count);
    break;
  }
}, false);

// Keyboard event handling.
var temp_value = "";  // Stores the string the user is typing, until enter is pressed.
var temp_value_coords;  // Stores the mouse position when user started typing.
window.onkeydown = function(e) {
  var key = e.keyCode ? e.keyCode : e.which;
  
  if (key == 187) { // =
    // Draws fake_canvas to canvas.
    for (var i = 0; i != canvas.width; i++) {
      for (var j = 0; j != canvas.height; j++) {
        if (!EqualsColor(fake_canvas[i][j], {r: 255, g: 255, b: 255, a: 255})) {
          SetColor(i, j, fake_canvas[i][j]); continue;
        }
      }
    }
  }
  
  if (key == 189) { // -
    // Iters everything in the code by starting from the [0] global scope.
    IterScopes(region_map[0], 0);
  }
  
  if (key > 47 && key < 91) { // 0 -> z
    // Types a string onto the canvas, saves the string in temp_value.
    if (temp_value == "") {
      temp_value_coords = {x: mouse.x, y: mouse.y};
    }
    temp_value += String.fromCharCode(key);
    context.fillStyle = "#000000";
    context.fillText(temp_value, temp_value_coords.x, temp_value_coords.y);
  }
  
  if (key == 13) { // enter
    // Sets the value of the variable the mouse was over to temp_value.
    region_map[regions[temp_value_coords.x][temp_value_coords.y]].SetValue(temp_value);
    temp_value = "";
  }
};

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