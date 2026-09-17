/* Generated from assets/journal/adobe-symbol.txt.
#
#  Name:             Adobe Symbol Encoding to Unicode
#  Unicode version:  2.0
#  Table version:    1.0
#  Date:             2011 July 12
#  
#  Copyright (c) 1991-2011 Unicode, Inc. All Rights reserved.
#  
#  This file is provided as-is by Unicode, Inc. (The Unicode Consortium). No
#  claims are made as to fitness for any particular purpose. No warranties of
#  any kind are expressed or implied. The recipient agrees to determine
#  applicability of information provided. If this file has been provided on
#  magnetic media by Unicode, Inc., the sole remedy for any claim will be
#  exchange of defective media within 90 days of receipt.
#  
#  Unicode, Inc. hereby grants the right to freely use the information
#  supplied in this file in the creation of products supporting the
#  Unicode Standard, and to make copies of this file in any form for
#  internal or external distribution as long as this notice remains
#  attached.
#  
#  Format: 4 tab-delimited fields:
#
#    (1) The Unicode value (in hexadecimal)
#    (2) The Symbol Encoding code point (in hexadecimal)
#    (3) # Unicode name
#    (4) # PostScript character name
#  
#  General Notes:
# 
#    The Unicode values in this table were produced as the result of applying
#    the algorithm described in the section "Populating a Unicode space" in the
#    document "Unicode and Glyph Names," at
#    http://partners.adobe.com/asn/developer/typeforum/unicodegn.html
#    to the characters in Symbol. Note that some characters, such as "space",
#    are mapped to 2 Unicode values. 29 characters have assignments in the
#    Corporate Use Subarea; these are indicated by "(CUS)" in field 4. Refer to
#    the above document for more details.
#
#    2011 July 12: The above link is no longer valid. For comparable,
#    more current information, see the document, "Glyph", at:
#    <http://www.adobe.com/devnet/opentype/archives/glyph.html>
#
#  Revision History:
#
#    [v1.0, 2011 July 12]
#    Updated terms of use to current wording.
#    Updated contact information and document link.
#    No changes to the mapping data.
#
#    [v0.2, 30 March 1999]
#    Different algorithm to produce Unicode values (see notes above) results in
#    some character codes being mapped to 2 Unicode values; use of Corporate
#    Use subarea values; addition of the euro character; changed assignments of
#    some characters such as the COPYRIGHT SIGNs and RADICAL EXTENDER. Updated
#    Unicode names to Unicode 2.0 names.
#
#    [v0.1, 5 May 1995] First release.
#
#  Use the Unicode reporting form <http://www.unicode.org/reporting.html>
#    for any questions or comments or to report errors in the data.
#
*/
export const SYMBOL_MAP:Readonly<Record<number,string>>={
  "33": "!",
  "34": "∀",
  "35": "#",
  "36": "∃",
  "37": "%",
  "38": "&",
  "39": "∋",
  "40": "(",
  "41": ")",
  "42": "∗",
  "43": "+",
  "44": ",",
  "45": "−",
  "46": ".",
  "47": "/",
  "48": "0",
  "49": "1",
  "50": "2",
  "51": "3",
  "52": "4",
  "53": "5",
  "54": "6",
  "55": "7",
  "56": "8",
  "57": "9",
  "58": ":",
  "59": ";",
  "60": "<",
  "61": "=",
  "62": ">",
  "63": "?",
  "64": "≅",
  "65": "Α",
  "66": "Β",
  "67": "Χ",
  "69": "Ε",
  "70": "Φ",
  "71": "Γ",
  "72": "Η",
  "73": "Ι",
  "74": "ϑ",
  "75": "Κ",
  "76": "Λ",
  "77": "Μ",
  "78": "Ν",
  "79": "Ο",
  "80": "Π",
  "81": "Θ",
  "82": "Ρ",
  "83": "Σ",
  "84": "Τ",
  "85": "Υ",
  "86": "ς",
  "88": "Ξ",
  "89": "Ψ",
  "90": "Ζ",
  "91": "[",
  "92": "∴",
  "93": "]",
  "94": "⊥",
  "95": "_",
  "97": "α",
  "98": "β",
  "99": "χ",
  "100": "δ",
  "101": "ε",
  "102": "φ",
  "103": "γ",
  "104": "η",
  "105": "ι",
  "106": "ϕ",
  "107": "κ",
  "108": "λ",
  "110": "ν",
  "111": "ο",
  "112": "π",
  "113": "θ",
  "114": "ρ",
  "115": "σ",
  "116": "τ",
  "117": "υ",
  "118": "ϖ",
  "119": "ω",
  "120": "ξ",
  "121": "ψ",
  "122": "ζ",
  "123": "{",
  "124": "|",
  "125": "}",
  "126": "∼",
  "160": "€",
  "161": "ϒ",
  "162": "′",
  "163": "≤",
  "165": "∞",
  "166": "ƒ",
  "167": "♣",
  "168": "♦",
  "169": "♥",
  "170": "♠",
  "171": "↔",
  "172": "←",
  "173": "↑",
  "174": "→",
  "175": "↓",
  "176": "°",
  "177": "±",
  "178": "″",
  "179": "≥",
  "180": "×",
  "181": "∝",
  "182": "∂",
  "183": "•",
  "184": "÷",
  "185": "≠",
  "186": "≡",
  "187": "≈",
  "188": "…",
  "191": "↵",
  "192": "ℵ",
  "193": "ℑ",
  "194": "ℜ",
  "195": "℘",
  "196": "⊗",
  "197": "⊕",
  "198": "∅",
  "199": "∩",
  "200": "∪",
  "201": "⊃",
  "202": "⊇",
  "203": "⊄",
  "204": "⊂",
  "205": "⊆",
  "206": "∈",
  "207": "∉",
  "208": "∠",
  "209": "∇",
  "213": "∏",
  "214": "√",
  "215": "⋅",
  "216": "¬",
  "217": "∧",
  "218": "∨",
  "219": "⇔",
  "220": "⇐",
  "221": "⇑",
  "222": "⇒",
  "223": "⇓",
  "224": "◊",
  "225": "〈",
  "229": "∑",
  "241": "〉",
  "242": "∫",
  "243": "⌠",
  "245": "⌡"
};
