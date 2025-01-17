// Copyright 2012 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Extensive modifications made by Chris Koch, 2020.
let url = "https://cdn.jsdelivr.net/npm/@chriskoch/golang-wasm@1.0.0";

function PlaygroundOutput(el) {
    'use strict';

    return function (write) {
        if (write.Kind == 'start') {
            el.innerHTML = '';
            return;
        }

        let cl = 'system';
        if (write.Kind == 'stdout' || write.Kind == 'stderr')
            cl = write.Kind;

        let m = write.Body;
        if (write.Kind == 'end') {
            m = '\nProgram exited' + (m ? (': ' + m) : '.');
        }

        if (m.indexOf('IMAGE:') === 0) {
            // TODO(adg): buffer all writes before creating image
            let url = 'data:image/png;base64,' + m.substr(6);
            let img = document.createElement('img');
            img.src = url;
            el.appendChild(img);
            return;
        }

        // ^L clears the screen.
        let s = m.split('\x0c');
        if (s.length > 1) {
            el.innerHTML = '';
            m = s.pop();
        }

        m = m.replace(/&/g, '&amp;');
        m = m.replace(/</g, '&lt;');
        m = m.replace(/>/g, '&gt;');

        let span = document.createElement('span');
        span.className = cl;
        span.innerHTML = m;
        el.appendChild(span);
    };
}

function getOutput() {
    let outputEl = document.getElementById("output");
    outputEl.innerHTML = "";
    let node = document.createElement('pre');
    let output = outputEl.appendChild(node);
    return PlaygroundOutput(output);
}


let init = async () => {
    let cmds = {};
    const exec = (wasm, args) => new Promise((resolve, reject) => {
        const go = new Go();
        go.exit = resolve;
        go.argv = go.argv.concat(args || []);
        WebAssembly.instantiate(wasm, go.importObject).then((result) => go.run(result.instance)).catch(reject);
    });

    let archivePromises =
        [
            '/prebuilt/runtime.a',
            '/prebuilt/internal/bytealg.a',
            '/prebuilt/internal/cpu.a',
            '/prebuilt/runtime/internal/atomic.a',
            '/prebuilt/runtime/internal/math.a',
            '/prebuilt/runtime/internal/sys.a',
        ].map(async path => {
            let res = await fetch(url + path);
            let buf = await res.arrayBuffer();
            writeToGoFilesystem('/golang' + path, new Uint8Array(buf))
        })

    let cmdPromises = ['compile', 'link', 'gofmt'].map(async cmd => {
        let res = await fetch(url + '/cmd/' + cmd + '.wasm')
        let buf = await res.arrayBuffer();
        cmds[cmd] = new Uint8Array(buf);
    })

    let initPromises = [...archivePromises, ...cmdPromises]
    await Promise.all(initPromises);

    const decoder = new TextDecoder('utf-8');
    const encoder = new TextEncoder('utf-8');

    writeToGoFilesystem('/importcfg', encoder.encode(
        "packagefile runtime=/golang/prebuilt/runtime.a"
    ));

    writeToGoFilesystem('/importcfg.link', encoder.encode(
        "packagefile command-line-arguments=main.a\n" +
        "packagefile runtime=/golang/prebuilt/runtime.a\n" +
        "packagefile internal/bytealg=/golang/prebuilt/internal/bytealg.a\n" +
        "packagefile internal/cpu=/golang/prebuilt/internal/cpu.a\n" +
        "packagefile runtime/internal/atomic=/golang/prebuilt/runtime/internal/atomic.a\n" +
        "packagefile runtime/internal/math=/golang/prebuilt/runtime/internal/math.a\n" +
        "packagefile runtime/internal/sys=/golang/prebuilt/runtime/internal/sys.a"
    ))

    window.GOLANG_READY();
    window.RUN_GOLANG = (body) => {
        let output = getOutput();
        writeToGoFilesystem('/main.go', body);
        output({
            Kind: 'start',
        });
        goStderr = (buf) => {
            output({
                Kind: 'stderr',
                Body: decoder.decode(buf),
            });
        };
        goStdout = (buf) => {
            output({
                Kind: 'stdout',
                Body: decoder.decode(buf),
            });
        };

        exec(cmds['compile'], ['-p', 'main', '-complete', '-dwarf=false', '-pack', '-importcfg', 'importcfg', 'main.go'])
            .then((code) => code || exec(cmds['link'], ['-importcfg', 'importcfg.link', '-buildmode=exe', 'main.a']))
            .then((code) => code || exec(readFromGoFilesystem('a.out')))
            .then((code) => {
                output({
                    Kind: 'end',
                    Body: code ? 'status ' + code + '.' : undefined,
                });
            })
            .catch((err) => {
                output({
                    Kind: 'end',
                    Body: 'wasm error: ' + (err.message || 'unknown'),
                });
            })
            .finally(window.GOLANG_DONE);

        format();
    }

    async function format() {
        writeToGoFilesystem('/main.go', window.GET_GOLANG_CODE());
        let retVal = await exec(cmds['gofmt'], ['-w', 'main.go']);
        if (!retVal) {
            let fmttedCode = decoder.decode(readFromGoFilesystem('main.go'));
            window.SET_GOLANG_CODE(fmttedCode);
        }
    }
}

init();