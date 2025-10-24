"use strict";
exports.__esModule = true;
exports.getPastelBackgroundColor = exports.getSourceUrl = exports.formatDate = void 0;
/**
 * Formats a date in a human-readable format.
 * Shows just "Month Day" for current year, or "Month Day, Year" for other years.
 */
var formatDate = function (date) {
    var dateObj = new Date(date);
    var now = new Date();
    var currentYear = now.getFullYear();
    var dateYear = dateObj.getFullYear();
    var monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    var month = monthNames[dateObj.getMonth()];
    var day = dateObj.getDate();
    var getOrdinalSuffix = function (n) {
        var _a, _b;
        var suffixes = ["th", "st", "nd", "rd"];
        var v = n % 100;
        var suffix = (_b = (_a = suffixes[(v - 20) % 10]) !== null && _a !== void 0 ? _a : suffixes[v]) !== null && _b !== void 0 ? _b : suffixes[0];
        return "".concat(n).concat(suffix);
    };
    var formattedDay = getOrdinalSuffix(day);
    if (dateYear !== currentYear) {
        return "".concat(month, " ").concat(formattedDay, ", ").concat(dateYear);
    }
    return "".concat(month, " ").concat(formattedDay);
};
exports.formatDate = formatDate;
/**
 * Gets the appropriate source URL for a document.
 * Handles special cases like Google Docs/Sheets/Slides.
 */
var getSourceUrl = function (document) {
    if (document.type === "google_doc" && document.customId) {
        return "https://docs.google.com/document/d/".concat(document.customId);
    }
    if (document.type === "google_sheet" && document.customId) {
        return "https://docs.google.com/spreadsheets/d/".concat(document.customId);
    }
    if (document.type === "google_slide" && document.customId) {
        return "https://docs.google.com/presentation/d/".concat(document.customId);
    }
    // Fallback to existing URL for all other document types
    return document.url;
};
exports.getSourceUrl = getSourceUrl;
/**
 * Generates a consistent pastel background color for a given seed string.
 * Uses a simple hash function to ensure the same string always produces the same color.
 */
var getPastelBackgroundColor = function (seed) {
    // Simple hash function to convert string to number
    var hash = 0;
    for (var i = 0; i < seed.length; i++) {
        var char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Use hash to generate pastel colors
    // Pastel colors have high lightness and moderate saturation
    var hue = Math.abs(hash % 360);
    var saturation = 25 + (Math.abs(hash) % 20); // 25-45% saturation
    var lightness = 15 + (Math.abs(hash >> 8) % 10); // 15-25% lightness for dark mode
    return "hsl(".concat(hue, ", ").concat(saturation, "%, ").concat(lightness, "%)");
};
exports.getPastelBackgroundColor = getPastelBackgroundColor;
