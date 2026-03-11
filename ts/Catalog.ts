/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { DOMBuilder } from "./DOMBuilder.js";
import { SAXParser } from "./SAXParser.js";
import { XMLAttribute } from "./XMLAttribute.js";
import { XMLDocument } from "./XMLDocument.js";
import { XMLElement } from "./XMLElement.js";
import { XMLUtils } from "./XMLUtils.js";

export class Catalog {

    systemCatalog: Map<string, string>;
    publicCatalog: Map<string, string>;
    uriCatalog: Map<string, string>;
    dtdCatalog: Map<string, string>;
    systemSuffixCatalog: Map<string, string>;
    uriSuffixCatalog: Map<string, string>;

    uriRewrites: Array<string[]>;
    systemRewrites: Array<string[]>;
    delegatePublicEntries: Array<string[]>;
    delegateSystemEntries: Array<string[]>;
    delegateURIEntries: Array<string[]>;

    workDir: string;
    base: string;
    prefer: string;
    visitedCatalogs: Set<string>;

    constructor(catalogFile: string, visitedCatalogs?: Set<string>) {
        if (!isAbsolute(catalogFile)) {
            throw new Error('Catalog file must be absolute: ' + catalogFile);
        }
        if (!existsSync(catalogFile)) {
            throw new Error('Catalog file ' + catalogFile + ' not found');
        }
        this.visitedCatalogs = visitedCatalogs ?? new Set<string>();
        if (this.visitedCatalogs.has(catalogFile)) {
            throw new Error('Circular catalog reference detected: ' + catalogFile);
        }
        this.visitedCatalogs.add(catalogFile);

        this.systemCatalog = new Map<string, string>();
        this.publicCatalog = new Map<string, string>();
        this.uriCatalog = new Map<string, string>();
        this.dtdCatalog = new Map<string, string>();
        this.systemSuffixCatalog = new Map<string, string>();
        this.uriSuffixCatalog = new Map<string, string>();
        this.uriRewrites = new Array<string[]>();
        this.systemRewrites = new Array<string[]>();
        this.delegatePublicEntries = new Array<string[]>();
        this.delegateSystemEntries = new Array<string[]>();
        this.delegateURIEntries = new Array<string[]>();
        this.workDir = dirname(catalogFile);
        this.base = '';
        this.prefer = 'public';

        let contentHandler: DOMBuilder = new DOMBuilder();
        let parser: SAXParser = new SAXParser();
        parser.setContentHandler(contentHandler);
        parser.parseFile(catalogFile);
        let catalogDocument: XMLDocument | undefined = contentHandler.getDocument();
        if (!catalogDocument) {
            throw new Error('Catalog file ' + catalogFile + ' is empty');
        }
        let catalogRoot: XMLElement | undefined = catalogDocument.getRoot();
        if (!catalogRoot) {
            throw new Error('Catalog file ' + catalogFile + ' is empty');
        }
        if (catalogRoot.getName() !== 'catalog') {
            throw new Error('Catalog root element must be <catalog>');
        }
        let preferAttr: XMLAttribute | undefined = catalogRoot.getAttribute('prefer');
        if (preferAttr) {
            this.prefer = preferAttr.getValue();
        }
        this.recurse(catalogRoot);
    }

    recurse(catalogRoot: XMLElement) {
        for (let child of catalogRoot.getChildren()) {
            let currentBase: string = this.base;
            let xmlBase: XMLAttribute | undefined = child.getAttribute("xml:base");
            if (xmlBase) {
                this.base = xmlBase.getValue();
                if (!this.base.endsWith('/')) {
                    this.base += '/';
                }
                if (!isAbsolute(this.base)) {
                    this.base = resolve(this.workDir, this.base);
                }
                if (!existsSync(this.base)) {
                    throw new Error('Invalid xml:base: ' + this.base);
                }
            }
            if (child.getName() === 'public') {
                let publicIdAttribute: XMLAttribute | undefined = child.getAttribute("publicId");
                if (!publicIdAttribute) {
                    throw new Error('publicId attribute is required for <public>');
                }
                let publicId: string = publicIdAttribute.getValue();
                if (publicId.startsWith("urn:publicid:")) {
                    publicId = this.unwrapUrn(publicId);
                }
                if (!this.publicCatalog.has(publicId)) {
                    let uriAttribute: XMLAttribute | undefined = child.getAttribute("uri");
                    if (!uriAttribute) {
                        throw new Error('uri attribute is required for <public>');
                    }
                    let uri: string = this.makeAbsolute(uriAttribute.getValue());
                    if (existsSync(uri)) {
                        this.publicCatalog.set(publicId, uri);
                        if (uri.endsWith(".dtd") || uri.endsWith(".ent") || uri.endsWith(".mod")) {
                            let name: string = basename(uri);
                            if (!this.dtdCatalog.has(name)) {
                                this.dtdCatalog.set(name, uri);
                            }
                        }
                    }
                }
            }
            if (child.getName() === 'system') {
                let uriAttribute: XMLAttribute | undefined = child.getAttribute("uri");
                if (!uriAttribute) {
                    throw new Error('uri attribute is required for <system>');
                }
                let uri: string = this.makeAbsolute(uriAttribute.getValue());
                if (existsSync(uri)) {
                    let systemId: XMLAttribute | undefined = child.getAttribute("systemId");
                    if (!systemId) {
                        throw new Error('systemId attribute is required for <system>');
                    }
                    this.systemCatalog.set(systemId.getValue(), uri);
                    if (uri.endsWith(".dtd")) {
                        let name: string = basename(uri);
                        if (!this.dtdCatalog.has(name)) {
                            this.dtdCatalog.set(name, uri);
                        }
                    }
                }
            }
            if (child.getName() === 'uri') {
                let uriAttribute: XMLAttribute | undefined = child.getAttribute("uri");
                if (!uriAttribute) {
                    throw new Error('uri attribute is required for <uri>');
                }
                let uri: string = this.makeAbsolute(uriAttribute.getValue());
                if (existsSync(uri)) {
                    let nameAttribute: XMLAttribute | undefined = child.getAttribute("name");
                    if (!nameAttribute) {
                        throw new Error('name attribute is required for <uri>');
                    }
                    this.uriCatalog.set(nameAttribute.getValue(), uri);
                    if (uri.endsWith(".dtd") || uri.endsWith(".ent") || uri.endsWith(".mod")) {
                        let name: string = basename(uri);
                        if (!this.dtdCatalog.has(name)) {
                            this.dtdCatalog.set(name, uri);
                        }
                    }
                }
            }
            if (child.getName() === 'rewriteURI') {
                let rewritePrefix: XMLAttribute | undefined = child.getAttribute("rewritePrefix");
                if (!rewritePrefix) {
                    throw new Error('rewritePrefix attribute is required for <rewriteURI>');
                }
                let uri: string = this.makeAbsolute(rewritePrefix.getValue());
                let uriStartString: XMLAttribute | undefined = child.getAttribute("uriStartString");
                if (!uriStartString) {
                    throw new Error('uriStartString attribute is required for <rewriteURI>');
                }
                let pair: string[] = [uriStartString.getValue(), uri];
                if (!this.uriRewrites.some(p => p[0] === pair[0])) {
                    this.uriRewrites.push(pair);
                }
            }
            if (child.getName() === 'rewriteSystem') {
                let rewritePrefix: XMLAttribute | undefined = child.getAttribute("rewritePrefix");
                if (!rewritePrefix) {
                    throw new Error('rewritePrefix attribute is required for <rewriteSystem>');
                }
                let uri: string = this.makeAbsolute(rewritePrefix.getValue());
                let systemIdStartString: XMLAttribute | undefined = child.getAttribute("systemIdStartString");
                if (!systemIdStartString) {
                    throw new Error('systemIdStartString attribute is required for <rewriteSystem>');
                }
                let pair: string[] = [systemIdStartString.getValue(), uri];
                if (!this.systemRewrites.some(p => p[0] === pair[0])) {
                    this.systemRewrites.push(pair);
                }
            }
            if (child.getName() === 'systemSuffix') {
                let systemIdSuffix: XMLAttribute | undefined = child.getAttribute("systemIdSuffix");
                if (!systemIdSuffix) {
                    throw new Error('systemIdSuffix attribute is required for <systemSuffix>');
                }
                let uriAttribute: XMLAttribute | undefined = child.getAttribute("uri");
                if (!uriAttribute) {
                    throw new Error('uri attribute is required for <systemSuffix>');
                }
                let uri: string = this.makeAbsolute(uriAttribute.getValue());
                if (existsSync(uri) && !this.systemSuffixCatalog.has(systemIdSuffix.getValue())) {
                    this.systemSuffixCatalog.set(systemIdSuffix.getValue(), uri);
                }
            }
            if (child.getName() === 'uriSuffix') {
                let uriSuffix: XMLAttribute | undefined = child.getAttribute("uriSuffix");
                if (!uriSuffix) {
                    throw new Error('uriSuffix attribute is required for <uriSuffix>');
                }
                let uriAttribute: XMLAttribute | undefined = child.getAttribute("uri");
                if (!uriAttribute) {
                    throw new Error('uri attribute is required for <uriSuffix>');
                }
                let uri: string = this.makeAbsolute(uriAttribute.getValue());
                if (existsSync(uri) && !this.uriSuffixCatalog.has(uriSuffix.getValue())) {
                    this.uriSuffixCatalog.set(uriSuffix.getValue(), uri);
                }
            }
            if (child.getName() === 'delegatePublic') {
                let publicIdStartString: XMLAttribute | undefined = child.getAttribute("publicIdStartString");
                if (!publicIdStartString) {
                    throw new Error('publicIdStartString attribute is required for <delegatePublic>');
                }
                let catalogAttribute: XMLAttribute | undefined = child.getAttribute("catalog");
                if (!catalogAttribute) {
                    throw new Error('catalog attribute is required for <delegatePublic>');
                }
                let catalogPath: string = this.makeAbsolute(catalogAttribute.getValue());
                let pair: string[] = [publicIdStartString.getValue(), catalogPath];
                if (!this.delegatePublicEntries.some(p => p[0] === pair[0])) {
                    this.delegatePublicEntries.push(pair);
                }
            }
            if (child.getName() === 'delegateSystem') {
                let systemIdStartString: XMLAttribute | undefined = child.getAttribute("systemIdStartString");
                if (!systemIdStartString) {
                    throw new Error('systemIdStartString attribute is required for <delegateSystem>');
                }
                let catalogAttribute: XMLAttribute | undefined = child.getAttribute("catalog");
                if (!catalogAttribute) {
                    throw new Error('catalog attribute is required for <delegateSystem>');
                }
                let catalogPath: string = this.makeAbsolute(catalogAttribute.getValue());
                let pair: string[] = [systemIdStartString.getValue(), catalogPath];
                if (!this.delegateSystemEntries.some(p => p[0] === pair[0])) {
                    this.delegateSystemEntries.push(pair);
                }
            }
            if (child.getName() === 'delegateURI') {
                let uriStartString: XMLAttribute | undefined = child.getAttribute("uriStartString");
                if (!uriStartString) {
                    throw new Error('uriStartString attribute is required for <delegateURI>');
                }
                let catalogAttribute: XMLAttribute | undefined = child.getAttribute("catalog");
                if (!catalogAttribute) {
                    throw new Error('catalog attribute is required for <delegateURI>');
                }
                let catalogPath: string = this.makeAbsolute(catalogAttribute.getValue());
                let pair: string[] = [uriStartString.getValue(), catalogPath];
                if (!this.delegateURIEntries.some(p => p[0] === pair[0])) {
                    this.delegateURIEntries.push(pair);
                }
            }
            if (child.getName() === 'nextCatalog') {
                let catalogAttribute: XMLAttribute | undefined = child.getAttribute("catalog");
                if (!catalogAttribute) {
                    throw new Error('catalog attribute is required for <nextCatalog>');
                }
                let nextCatalogPath: string = this.makeAbsolute(catalogAttribute.getValue());
                if (this.visitedCatalogs.has(nextCatalogPath)) {
                    throw new Error('Circular catalog reference detected: ' + nextCatalogPath);
                }
                let catalog: Catalog = new Catalog(nextCatalogPath, new Set(this.visitedCatalogs));
                let map: Map<string, string> = catalog.getSystemCatalog();
                map.forEach((value, key) => {
                    if (!this.systemCatalog.has(key)) {
                        this.systemCatalog.set(key, value);
                    }
                });
                map = catalog.getPublicCatalog();
                map.forEach((value, key) => {
                    if (!this.publicCatalog.has(key)) {
                        this.publicCatalog.set(key, value);
                    }
                });
                map = catalog.getUriCatalog();
                map.forEach((value, key) => {
                    if (!this.uriCatalog.has(key)) {
                        this.uriCatalog.set(key, value);
                    }
                });
                map = catalog.getDtdCatalog();
                map.forEach((value, key) => {
                    if (!this.dtdCatalog.has(key)) {
                        this.dtdCatalog.set(key, value);
                    }
                });
                map = catalog.getSystemSuffixCatalog();
                map.forEach((value, key) => {
                    if (!this.systemSuffixCatalog.has(key)) {
                        this.systemSuffixCatalog.set(key, value);
                    }
                });
                map = catalog.getUriSuffixCatalog();
                map.forEach((value, key) => {
                    if (!this.uriSuffixCatalog.has(key)) {
                        this.uriSuffixCatalog.set(key, value);
                    }
                });
                let array: Array<string[]> = catalog.getUriRewrites();
                array.forEach((value) => {
                    if (!this.uriRewrites.some(p => p[0] === value[0])) {
                        this.uriRewrites.push(value);
                    }
                });
                array = catalog.getSystemRewrites();
                array.forEach((value) => {
                    if (!this.systemRewrites.some(p => p[0] === value[0])) {
                        this.systemRewrites.push(value);
                    }
                });
                array = catalog.getDelegatePublicEntries();
                array.forEach((value) => {
                    if (!this.delegatePublicEntries.some(p => p[0] === value[0])) {
                        this.delegatePublicEntries.push(value);
                    }
                });
                array = catalog.getDelegateSystemEntries();
                array.forEach((value) => {
                    if (!this.delegateSystemEntries.some(p => p[0] === value[0])) {
                        this.delegateSystemEntries.push(value);
                    }
                });
                array = catalog.getDelegateURIEntries();
                array.forEach((value) => {
                    if (!this.delegateURIEntries.some(p => p[0] === value[0])) {
                        this.delegateURIEntries.push(value);
                    }
                });
            }
            this.recurse(child);
            this.base = currentBase;
        }
    }

    makeAbsolute(uri: string): string {
        if (isAbsolute(uri)) {
            return uri;
        }
        if (this.base !== '') {
            return resolve(this.base, uri);
        }
        return resolve(this.workDir, uri);
    }

    unwrapUrn(urn: string): string {
        if (!urn.startsWith('urn:publicid:')) {
            return urn;
        }
        let publicId: string = urn.trim().substring('urn:publicid:'.length);
        publicId = XMLUtils.replaceAll(publicId, '+', ' ');
        publicId = XMLUtils.replaceAll(publicId, ':', '//');
        publicId = XMLUtils.replaceAll(publicId, ';', '::');
        publicId = XMLUtils.replaceAll(publicId, '%2B', '+');
        publicId = XMLUtils.replaceAll(publicId, '%3A', ':');
        publicId = XMLUtils.replaceAll(publicId, '%2F', '/');
        publicId = XMLUtils.replaceAll(publicId, '%3B', ';');
        publicId = XMLUtils.replaceAll(publicId, '%27', '\'');
        publicId = XMLUtils.replaceAll(publicId, '%3F', '?');
        publicId = XMLUtils.replaceAll(publicId, '%23', '#');
        return XMLUtils.replaceAll(publicId, '%25', '%');
    }

    getSystemCatalog(): Map<string, string> {
        return this.systemCatalog;
    }

    getPublicCatalog(): Map<string, string> {
        return this.publicCatalog;
    }

    getUriCatalog(): Map<string, string> {
        return this.uriCatalog;
    }

    getDtdCatalog(): Map<string, string> {
        return this.dtdCatalog;
    }

    getSystemSuffixCatalog(): Map<string, string> {
        return this.systemSuffixCatalog;
    }

    getUriSuffixCatalog(): Map<string, string> {
        return this.uriSuffixCatalog;
    }

    getUriRewrites(): Array<string[]> {
        return this.uriRewrites;
    }

    getSystemRewrites(): Array<string[]> {
        return this.systemRewrites;
    }

    getDelegatePublicEntries(): Array<string[]> {
        return this.delegatePublicEntries;
    }

    getDelegateSystemEntries(): Array<string[]> {
        return this.delegateSystemEntries;
    }

    getDelegateURIEntries(): Array<string[]> {
        return this.delegateURIEntries;
    }

    resolveEntity(publicId: string, systemId: string): string | undefined {
        if (this.prefer === 'system') {
            if (systemId) {
                let location: string | undefined = this.matchSystem(systemId);
                if (location) {
                    return location;
                }
            }
            if (publicId) {
                return this.matchPublic(publicId);
            }
            return undefined;
        }
        // default: prefer="public"
        if (publicId) {
            let location: string | undefined = this.matchPublic(publicId);
            if (location) {
                return location;
            }
        }
        return this.matchSystem(systemId);
    }

    matchSystem(systemId: string): string | undefined {
        if (systemId) {
            // Apply the rewrite with the longest matching prefix (spec: longest match wins)
            let bestPrefix = '';
            let bestRewriteUri = '';
            for (let pair of this.systemRewrites) {
                if (systemId.startsWith(pair[0]) && pair[0].length > bestPrefix.length) {
                    bestPrefix = pair[0];
                    bestRewriteUri = pair[1];
                }
            }
            if (bestPrefix) {
                systemId = bestRewriteUri + systemId.substring(bestPrefix.length);
            }
            // If any delegateSystem entry matches, search only those catalogs (spec: do not continue here)
            let matchingDelegates = this.delegateSystemEntries
                .filter(pair => systemId.startsWith(pair[0]))
                .sort((a, b) => b[0].length - a[0].length);
            if (matchingDelegates.length > 0) {
                for (let pair of matchingDelegates) {
                    if (existsSync(pair[1])) {
                        let delegateCatalog = new Catalog(pair[1], new Set(this.visitedCatalogs));
                        let result = delegateCatalog.matchSystem(systemId);
                        if (result) {
                            return result;
                        }
                    }
                }
                return undefined;
            }
            if (this.systemCatalog.has(systemId)) {
                return this.systemCatalog.get(systemId);
            }
            // systemSuffix: longest matching suffix wins
            let bestSuffix = '';
            let bestSuffixUri: string | undefined;
            for (let [suffix, uri] of this.systemSuffixCatalog) {
                if (systemId.endsWith(suffix) && suffix.length > bestSuffix.length) {
                    bestSuffix = suffix;
                    bestSuffixUri = uri;
                }
            }
            if (bestSuffixUri) {
                return bestSuffixUri;
            }
            let fileName: string = basename(systemId);
            if (this.dtdCatalog.has(fileName)) {
                return this.dtdCatalog.get(fileName);
            }
        }
        return undefined;
    }

    matchPublic(publicId: string): string | undefined {
        if (publicId.startsWith("urn:publicid:")) {
            publicId = this.unwrapUrn(publicId);
        }
        // If any delegatePublic entry matches, search only those catalogs (spec: do not continue here)
        let matchingDelegates = this.delegatePublicEntries
            .filter(pair => publicId.startsWith(pair[0]))
            .sort((a, b) => b[0].length - a[0].length);
        if (matchingDelegates.length > 0) {
            for (let pair of matchingDelegates) {
                if (existsSync(pair[1])) {
                    let delegateCatalog = new Catalog(pair[1], new Set(this.visitedCatalogs));
                    let result = delegateCatalog.matchPublic(publicId);
                    if (result) {
                        return result;
                    }
                }
            }
            return undefined;
        }
        if (this.publicCatalog.has(publicId)) {
            return this.publicCatalog.get(publicId);
        }
        return undefined;
    }

    matchURI(uri: string): string | undefined {
        if (uri) {
            // Apply the rewrite with the longest matching prefix (spec: longest match wins)
            let bestPrefix = '';
            let bestRewriteUri = '';
            for (let pair of this.uriRewrites) {
                if (uri.startsWith(pair[0]) && pair[0].length > bestPrefix.length) {
                    bestPrefix = pair[0];
                    bestRewriteUri = pair[1];
                }
            }
            if (bestPrefix) {
                uri = bestRewriteUri + uri.substring(bestPrefix.length);
            }
            // If any delegateURI entry matches, search only those catalogs (spec: do not continue here)
            let matchingDelegates = this.delegateURIEntries
                .filter(pair => uri.startsWith(pair[0]))
                .sort((a, b) => b[0].length - a[0].length);
            if (matchingDelegates.length > 0) {
                for (let pair of matchingDelegates) {
                    if (existsSync(pair[1])) {
                        let delegateCatalog = new Catalog(pair[1], new Set(this.visitedCatalogs));
                        let result = delegateCatalog.matchURI(uri);
                        if (result) {
                            return result;
                        }
                    }
                }
                return undefined;
            }
            if (this.uriCatalog.has(uri)) {
                return this.uriCatalog.get(uri);
            }
            // uriSuffix: longest matching suffix wins
            let bestSuffix = '';
            let bestSuffixUri: string | undefined;
            for (let [suffix, suffixUri] of this.uriSuffixCatalog) {
                if (uri.endsWith(suffix) && suffix.length > bestSuffix.length) {
                    bestSuffix = suffix;
                    bestSuffixUri = suffixUri;
                }
            }
            if (bestSuffixUri) {
                return bestSuffixUri;
            }
        }
        return undefined;
    }
}


