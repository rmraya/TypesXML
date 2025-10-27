/*******************************************************************************
 * Copyright (c) 2023-2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { RelaxNGGrammar } from './RelaxNGGrammar';
import { RelaxNGPattern, RelaxNGPatternType } from './RelaxNGPattern';

export class RelaxNGSimplifier {

    static simplifyGrammar(grammar: RelaxNGGrammar): void {
        // Simplify start pattern
        const startPattern = grammar.getStartPattern();
        if (startPattern) {
            const simplifiedStart = this.simplifyPattern(startPattern, grammar);
            grammar.setStartPattern(simplifiedStart);
        }

        // Simplify all define patterns
        const defines = grammar.getDefines();
        for (const [name, pattern] of defines) {
            const simplified = this.simplifyPattern(pattern, grammar);
            defines.set(name, simplified);
        }
    }

    static simplifyPattern(pattern: RelaxNGPattern, grammar: RelaxNGGrammar): RelaxNGPattern {
        if (!pattern) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        // First, recursively simplify children
        const childrenSimplified = pattern.getChildren().map(child =>
            this.simplifyPattern(child, grammar)
        );

        // Apply simplification rules based on pattern type
        switch (pattern.getType()) {
            case RelaxNGPatternType.OPTIONAL:
                return this.simplifyOptional(childrenSimplified);

            case RelaxNGPatternType.ZERO_OR_MORE:
                return this.simplifyZeroOrMore(childrenSimplified);

            case RelaxNGPatternType.ONE_OR_MORE:
                return this.simplifyOneOrMore(childrenSimplified);

            case RelaxNGPatternType.MIXED:
                return this.simplifyMixed(childrenSimplified);

            case RelaxNGPatternType.CHOICE:
                return this.simplifyChoice(childrenSimplified);

            case RelaxNGPatternType.GROUP:
                return this.simplifyGroup(childrenSimplified);

            case RelaxNGPatternType.INTERLEAVE:
                return this.simplifyInterleave(childrenSimplified);

            case RelaxNGPatternType.REF:
                return this.simplifyRef(pattern, grammar);

            case RelaxNGPatternType.LIST:
                return this.simplifyList(childrenSimplified);

            default:
                // For leaf patterns (element, attribute, text, empty, etc.), 
                // create new pattern with simplified children
                return this.createSimplifiedPattern(pattern, childrenSimplified);
        }
    }

    private static simplifyOptional(children: RelaxNGPattern[]): RelaxNGPattern {
        if (children.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        }

        const choice = new RelaxNGPattern(RelaxNGPatternType.CHOICE);
        choice.addChild(children[0]);
        choice.addChild(new RelaxNGPattern(RelaxNGPatternType.EMPTY));

        return this.simplifyChoice([children[0], new RelaxNGPattern(RelaxNGPatternType.EMPTY)]);
    }

    private static simplifyZeroOrMore(children: RelaxNGPattern[]): RelaxNGPattern {
        if (children.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        }

        const oneOrMore = new RelaxNGPattern(RelaxNGPatternType.ONE_OR_MORE);
        oneOrMore.addChild(children[0]);
        const simplifiedOneOrMore = this.simplifyOneOrMore([children[0]]);

        return this.simplifyChoice([simplifiedOneOrMore, new RelaxNGPattern(RelaxNGPatternType.EMPTY)]);
    }

    private static simplifyOneOrMore(children: RelaxNGPattern[]): RelaxNGPattern {
        if (children.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        const zeroOrMore = new RelaxNGPattern(RelaxNGPatternType.ZERO_OR_MORE);
        zeroOrMore.addChild(children[0]);

        return this.simplifyGroup([children[0], zeroOrMore]);
    }

    private static simplifyMixed(children: RelaxNGPattern[]): RelaxNGPattern {
        if (children.length === 0) {
            const zeroOrMoreText = new RelaxNGPattern(RelaxNGPatternType.ZERO_OR_MORE);
            zeroOrMoreText.addChild(new RelaxNGPattern(RelaxNGPatternType.TEXT));
            return zeroOrMoreText;
        }

        const zeroOrMoreText = new RelaxNGPattern(RelaxNGPatternType.ZERO_OR_MORE);
        zeroOrMoreText.addChild(new RelaxNGPattern(RelaxNGPatternType.TEXT));

        return this.simplifyInterleave([children[0], zeroOrMoreText]);
    }

    private static simplifyChoice(children: RelaxNGPattern[]): RelaxNGPattern {
        const simplified: RelaxNGPattern[] = [];

        for (const child of children) {
            if (child.getType() === RelaxNGPatternType.NOT_ALLOWED) {
                // Skip notAllowed patterns in choice
                continue;
            } else if (child.getType() === RelaxNGPatternType.CHOICE) {
                // Flatten nested choices
                simplified.push(...child.getChildren());
            } else {
                simplified.push(child);
            }
        }

        // Remove duplicates (simplified comparison)
        const unique = this.removeDuplicatePatterns(simplified);

        if (unique.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        } else if (unique.length === 1) {
            return unique[0];
        } else {
            const choice = new RelaxNGPattern(RelaxNGPatternType.CHOICE);
            unique.forEach(child => choice.addChild(child));
            return choice;
        }
    }

    private static simplifyGroup(children: RelaxNGPattern[]): RelaxNGPattern {
        const simplified: RelaxNGPattern[] = [];

        for (const child of children) {
            if (child.getType() === RelaxNGPatternType.NOT_ALLOWED) {
                // Any notAllowed in group makes entire group notAllowed
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
            } else if (child.getType() === RelaxNGPatternType.EMPTY) {
                // Skip empty patterns in group
                continue;
            } else if (child.getType() === RelaxNGPatternType.GROUP) {
                // Flatten nested groups
                simplified.push(...child.getChildren());
            } else {
                simplified.push(child);
            }
        }

        if (simplified.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        } else if (simplified.length === 1) {
            return simplified[0];
        } else {
            const group = new RelaxNGPattern(RelaxNGPatternType.GROUP);
            simplified.forEach(child => group.addChild(child));
            return group;
        }
    }

    private static simplifyInterleave(children: RelaxNGPattern[]): RelaxNGPattern {
        const simplified: RelaxNGPattern[] = [];

        for (const child of children) {
            if (child.getType() === RelaxNGPatternType.NOT_ALLOWED) {
                // Any notAllowed in interleave makes entire interleave notAllowed
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
            } else if (child.getType() === RelaxNGPatternType.EMPTY) {
                // Skip empty patterns in interleave
                continue;
            } else if (child.getType() === RelaxNGPatternType.INTERLEAVE) {
                // Flatten nested interleaves
                simplified.push(...child.getChildren());
            } else {
                simplified.push(child);
            }
        }

        if (simplified.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        } else if (simplified.length === 1) {
            return simplified[0];
        } else {
            const interleave = new RelaxNGPattern(RelaxNGPatternType.INTERLEAVE);
            simplified.forEach(child => interleave.addChild(child));
            return interleave;
        }
    }

    private static simplifyRef(refPattern: RelaxNGPattern, grammar: RelaxNGGrammar): RelaxNGPattern {
        const refName = refPattern.getRefName();
        if (!refName) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        const definedPattern = grammar.getDefine(refName);
        if (!definedPattern) {
            throw new Error(`Undefined reference: ${refName}`);
        }

        // Recursively simplify the referenced pattern
        return this.simplifyPattern(definedPattern, grammar);
    }

    private static simplifyList(children: RelaxNGPattern[]): RelaxNGPattern {
        if (children.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        }

        const list = new RelaxNGPattern(RelaxNGPatternType.LIST);

        // For list, we need to convert the content to a specific form
        // list P becomes a specialized pattern for whitespace-separated values
        const simplified = this.simplifyGroup(children);
        list.addChild(simplified);

        return list;
    }

    private static createSimplifiedPattern(original: RelaxNGPattern, simplifiedChildren: RelaxNGPattern[]): RelaxNGPattern {
        const simplified = new RelaxNGPattern(original.getType());

        // Copy all properties from original
        if (original.getName()) {
            simplified.setName(original.getName()!);
        }
        if (original.getNamespace()) {
            simplified.setNamespace(original.getNamespace()!);
        }
        if (original.getDataType()) {
            simplified.setDataType(original.getDataType()!);
        }
        if (original.getDatatypeLibrary()) {
            simplified.setDatatypeLibrary(original.getDatatypeLibrary()!);
        }
        if (original.getValue()) {
            simplified.setValue(original.getValue()!);
        }
        if (original.getRefName()) {
            simplified.setRefName(original.getRefName()!);
        }
        if (original.getHref()) {
            simplified.setHref(original.getHref()!);
        }
        if (original.getNs()) {
            simplified.setNs(original.getNs()!);
        }

        // Add simplified children
        simplifiedChildren.forEach(child => simplified.addChild(child));

        return simplified;
    }

    private static removeDuplicatePatterns(patterns: RelaxNGPattern[]): RelaxNGPattern[] {
        const unique: RelaxNGPattern[] = [];

        for (const pattern of patterns) {
            let isDuplicate = false;

            for (const existing of unique) {
                if (this.patternsEqual(pattern, existing)) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                unique.push(pattern);
            }
        }

        return unique;
    }

    private static patternsEqual(p1: RelaxNGPattern, p2: RelaxNGPattern): boolean {
        if (p1.getType() !== p2.getType()) {
            return false;
        }

        // Compare basic properties
        if (p1.getName() !== p2.getName() ||
            p1.getNamespace() !== p2.getNamespace() ||
            p1.getDataType() !== p2.getDataType() ||
            p1.getValue() !== p2.getValue()) {
            return false;
        }

        // Compare children count
        const children1 = p1.getChildren();
        const children2 = p2.getChildren();

        if (children1.length !== children2.length) {
            return false;
        }

        // Recursively compare children
        for (let i = 0; i < children1.length; i++) {
            if (!this.patternsEqual(children1[i], children2[i])) {
                return false;
            }
        }

        return true;
    }
}