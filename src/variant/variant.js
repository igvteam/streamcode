/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Broad Institute
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */


/**
 * Parser for VCF files.
 */

class Variant {

    constructor() {

        this.chr = tokens[0]; // TODO -- use genome aliases
        this.pos = parseInt(tokens[1]);
        this.names = tokens[2];    // id in VCF
        this.referenceBases = tokens[3];
        this.alternateBases = tokens[4];
        this.quality = parseInt(tokens[5]);
        this.filter = tokens[6];
        this.info = tokens[7];

        init(variant);

        return variant;
    }


    init() {

        const ref = this.referenceBases;
        const altBases = this.alternateBases

        // Check for reference block
        if (isRef(altBases) || "." === altBases) {
            this.type = "refblock";
            this.heterozygosity = 0;
            this.start = this.pos - 1;      // convert to 0-based coordinate convention
            this.end = this.start + ref.length

        } else {
            this.type = getVariantType(this.info)
            const altTokens = altBases.split(",").filter(token => token.length > 0);
            this.alleles = [];
            this.start = variant.pos;
            this.end = variant.pos;

            for (let alt of altTokens) {

                this.alleles.push(alt);
                let alleleStart
                let alleleEnd

                // We don't yet handle  SV and other special alt representations
                if ("sv" === this.type || !isKnownAlt(alt)) {
                    // Unknown alt representation (SA or other special tag)
                    alleleStart = variant.pos - 1
                    alleleEnd = alleleStart + ref.length

                } else {

                    let altLength = alt.length;
                    let lengthOnRef = ref.length;

                    // Trim off matching bases.  Try first match, then right -> left,  then any remaining left -> right
                    let s = 0;
                    if (ref.charCodeAt(0) === alt.charCodeAt(0)) {
                        s++;
                        altLength--;
                        lengthOnRef--;
                    }

                    // right -> left from end
                    while (altLength > 0 && lengthOnRef > 0) {
                        if (alt.charCodeAt(s + altLength - 1) === ref.charCodeAt(s + lengthOnRef - 1)) {
                            altLength--;
                            lengthOnRef--;
                        } else {
                            break;
                        }
                    }

                    // if any remaining, left -> right
                    while (altLength > 0 && lengthOnRef > 0) {
                        if (alt.charCodeAt(s + altLength - 1) === ref.charCodeAt(s + lengthOnRef - 1)) {
                            s++;
                            altLength--;
                            lengthOnRef--;
                        } else {
                            break;
                        }
                    }
                    alleleStart = variant.pos + s - 1;      // -1 for zero based coordinates
                    alleleEnd = alleleStart + Math.max(1, lengthOnRef)     // insertions have zero length on ref, but we give them 1
                }

                this.start = Math.min(this.start, alleleStart);
                this.end = Math.max(this.end, alleleEnd);
            }
        }
    }

    isRefBlock() {
        return "refblock" === this.type;
    }

}


function isRef(altAlleles) {

    return !altAlleles ||
        altAlleles.trim().length === 0 ||
        altAlleles === "<NON_REF>" ||
        altAlleles === "<*>";

}

function arrayToString(value, delim) {

    if (delim === undefined) delim = ",";

    if (!(Array.isArray(value))) {
        return value;
    }
    return value.join(delim);
}


function isKnownAlt(alt) {
    const knownAltBases = new Set(["A", "C", "T", "G"].map(c => c.charCodeAt(0)))
    for (let i = 0; i < alt.length; i++) {
        if (!knownAltBases.has(alt.charCodeAt(i))) {
            return false;
        }
    }
    return true;

}

function getVariantType(infoStr) {

    if (!infoStr) return undefined;

    const tokens = infoStr.split(';')
    for (elem of tokens) {
        var element = elem.split('=');
        if (element === "type") return element[1];
    }
    return undefined;
}


module.exports = Variant