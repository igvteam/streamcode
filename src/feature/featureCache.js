"use strict";

const IntervalTree = require('../util/intervalTree')

/**
 * Object for caching lists of features.  Supports efficient queries for sub-range  (chr, start, end)
 *
 * @param featureList
 * @param The genomic range spanned by featureList (optional)
 * @constructor
 */

class FeatureCache {

    constructor(featureList, genome, range) {
        this.treeMap = buildTreeMap(featureList, genome);
        this.range = range;
    }

    containsRange(genomicRange) {
        // No range means cache contains all features
        return (this.range === undefined || this.range.contains(genomicRange.chr, genomicRange.start, genomicRange.end));
    }


    queryFeatures(chr, start, end) {

        var featureList, intervalFeatures, feature, len, i, tree, intervals;

        tree = this.treeMap[chr];

        if (!tree) return [];

        intervals = tree.findOverlapping(start, end);

        if (intervals.length == 0) {
            return [];
        }
        else {
            // Trim the list of features in the intervals to those
            // overlapping the requested range.
            // Assumption: features are sorted by start position

            featureList = [];

            intervals.forEach(function (interval) {
                intervalFeatures = interval.value;
                len = intervalFeatures.length;
                for (i = 0; i < len; i++) {
                    feature = intervalFeatures[i];
                    if (feature.start > end) break;
                    else if (feature.end >= start) {
                        featureList.push(feature);
                    }
                }
            });

            featureList.sort(function (a, b) {
                return a.start - b.start;
            });

            return featureList;
        }

    };

    /**
     * Returns all features, unsorted.
     *
     * @returns {Array}
     */
    getAllFeatures() {


        var allFeatures = [];
        var treeMap = this.treeMap;
        if (treeMap) {
            for (var key in treeMap) {
                if (treeMap.hasOwnProperty(key)) {

                    var tree = treeMap[key];
                    tree.mapIntervals(function (interval) {
                        allFeatures = allFeatures.concat(interval.value);
                    });
                }
            }
        }

        return allFeatures;

    }
}

function buildTreeMap(featureList, genome) {

    const treeMap = {};
    const chromosomes = [];
    const featureCache = {};

    if (featureList) {

        featureList.forEach(function (feature) {

            let chr = feature.chr;

            // Translate to "official" name
            if (genome) {
                chr = genome.getChromosomeName(chr);
            }

            let geneList = featureCache[chr];

            if (!geneList) {
                chromosomes.push(chr);
                geneList = [];
                featureCache[chr] = geneList;
            }
            geneList.push(feature);
        });


        // Now build interval tree for each chromosome
        for (let i = 0; i < chromosomes.length; i++) {
            const chr = chromosomes[i];
            treeMap[chr] = buildIntervalTree(featureCache[chr]);
        }
    }

    return treeMap;
};

/**
 * Build an interval tree from the feature list for fast interval based queries.   We lump features in groups
 * of 10, or total size / 100,   to reduce size of the tree.
 *
 * @param featureList
 */
function buildIntervalTree(featureList) {

    var i, e, iStart, iEnd, tree, chunkSize, len, subArray;

    tree = new IntervalTree();
    len = featureList.length;

    chunkSize = Math.max(10, Math.round(len / 100));

    featureList.sort(function (f1, f2) {
        return (f1.start === f2.start ? 0 : (f1.start > f2.start ? 1 : -1));
    });

    for (i = 0; i < len; i += chunkSize) {
        e = Math.min(len, i + chunkSize);
        subArray = featureList.slice(i, e);
        iStart = subArray[0].start;
        //
        iEnd = iStart;
        subArray.forEach(function (feature) {
            iEnd = Math.max(iEnd, feature.end);
        });
        tree.insert(iStart, iEnd, subArray);
    }

    return tree;
}


