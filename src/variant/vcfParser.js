const getDataWrapper = require("../util/dataWrapper")
const Variant = require("./variant")

/**
 * Parser for VCF files.
 */
class VcfParser {

    constructor(type) {
        this.type = type;
    }

    async parseHeader(data) {

        var dataWrapper,
            tokens,
            line,
            j,
            header = {},
            id,
            values,
            ltIdx,
            gtIdx,
            type;

        dataWrapper = getDataWrapper(data);

        // First line must be file format
        line = dataWrapper.nextLine();
        if (line.startsWith("##fileformat")) {
            header.version = line.substr(13);
        } else {
            throw new Error("Invalid VCF file: missing fileformat line");
        }

        while (line = dataWrapper.nextLine()) {

            if (line.startsWith("#")) {

                id = null;
                values = {};

                if (line.startsWith("##")) {

                    if (line.startsWith("##INFO") || line.startsWith("##FILTER") || line.startsWith("##FORMAT")) {

                        ltIdx = line.indexOf("<");
                        gtIdx = line.lastIndexOf(">");

                        if (!(ltIdx > 2 && gtIdx > 0)) {
                            console.log("Malformed VCF header line: " + line);
                            continue;
                        }

                        type = line.substring(2, ltIdx - 1);
                        if (!header[type]) header[type] = {};

                        //##INFO=<ID=AF,Number=A,Type=Float,Description="Allele frequency based on Flow Evaluator observation counts">
                        // ##FILTER=<ID=NOCALL,Description="Generic filter. Filtering details stored in FR info tag.">
                        // ##FORMAT=<ID=AF,Number=A,Type=Float,Description="Allele frequency based on Flow Evaluator observation counts">

                        tokens = splitStringRespectingQuotes(line.substring(ltIdx + 1, gtIdx - 1), ",");

                        tokens.forEach(function (token) {
                            var kv = token.split("=");
                            if (kv.length > 1) {
                                if (kv[0] === "ID") {
                                    id = kv[1];
                                } else {
                                    values[kv[0]] = kv[1];
                                }
                            }
                        });

                        if (id) {
                            header[type][id] = values;
                        }
                    } else {
                        // Ignoring other ## header lines
                    }
                } else if (line.startsWith("#CHROM")) {
                    tokens = line.split("\t");

                    if (tokens.length > 8) {

                        // call set names -- use column index for id
                        header.callSets = [];
                        for (j = 9; j < tokens.length; j++) {
                            header.callSets.push({id: j, name: tokens[j]});
                        }
                    }
                }

            } else {
                break;
            }

        }

        this.header = header;  // Will need to intrepret genotypes and info field

        return header;
    }


    /**
     * Parse data as a collection of Variant objects.
     *
     * @param data
     * @returns {Array}
     */

    async parseFeatures(data) {

        const allFeatures = []

        const callSets = this.header.callSets

        const dataWrapper = getDataWrapper(data);

        let line
        while (line = dataWrapper.nextLine()) {

            if (!line.startsWith("#")) {
                const tokens = line.split("\t");
                if (tokens.length >= 8) {

                    const variant = new Variant(tokens);
                    if (variant.isRefBlock()) continue;     // Skip reference blocks

                    variant.header = this.header;       // Keep a pointer to the header to interpret fields for popup text
                    allFeatures.push(variant);

                    if (tokens.length > 9) {

                        // Format
                        const callFields = extractCallFields(tokens[8].split(":"));

                        variant.calls = {};

                        for (let index = 9; index < tokens.length; index++) {

                            const token = tokens[index];

                            var callSet = callSets[index - 9],
                                call = {
                                    callSetName: callSet.name,
                                    info: {}
                                };

                            variant.calls[callSet.id] = call;

                            token.split(":").forEach(function (callToken, idx) {

                                switch (idx) {
                                    case callFields.genotypeIndex:
                                        call.genotype = [];
                                        callToken.split(/[\|\/]/).forEach(function (s) {
                                            call.genotype.push(parseInt(s));
                                        });
                                        break;

                                    default:
                                        call.info[callFields.fields[idx]] = callToken;
                                }
                            });
                        }
                    }
                }
            }
        }

        return allFeatures;
    }

}

function extractCallFields(tokens) {

    var callFields = {
            genotypeIndex: -1,
            fields: tokens
        },
        i;

    for (i = 0; i < tokens.length; i++) {
        if ("GT" === tokens[i]) {
            callFields.genotypeIndex = i;
        }
    }

    return callFields;

}


function splitStringRespectingQuotes(string, delim) {

    var tokens = [],
        len = string.length,
        i,
        n = 0,
        quote = false,
        c;

    if (len > 0) {

        tokens[n] = string.charAt(0);
        for (i = 1; i < len; i++) {
            c = string.charAt(i);
            if (c === '"') {
                quote = !quote;
            } else if (!quote && c === delim) {
                n++;
                tokens[n] = "";
            } else {
                tokens[n] += c;
            }
        }
    }
    return tokens;
}

