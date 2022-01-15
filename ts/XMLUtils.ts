/*******************************************************************************
 * Copyright (c) 2022 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

export class XMLUtils {

    static cleanString(text: string): string {
        let result: string = text.replace('&', '&amp;');
        return result.replace('<', '&lt;');
    }

    static unquote(text: string): string {
        return text.replace('"', '&quot;');
    }
}