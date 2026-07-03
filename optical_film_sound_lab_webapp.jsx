export default function OpticalFilmSoundLab() {
  return (
    <div className="w-full min-h-screen bg-black text-white p-6 font-sans">
      <h1 className="text-4xl font-bold mb-4">Optical Film Sound Lab</h1>
      <p className="text-zinc-300 mb-6 max-w-3xl">
        Load a film/video file and convert the moving image into sound using multiple optical soundtrack techniques inspired by experimental cinema, scan synthesis, and vintage optical film readers.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-zinc-900 rounded-3xl p-4 shadow-2xl border border-zinc-800">
          <div className="flex flex-wrap gap-3 mb-4">
            <label className="bg-white text-black px-4 py-2 rounded-xl cursor-pointer hover:bg-zinc-200 transition">
              Load Film
              <input id="videoLoader" type="file" accept="video/*" className="hidden" />
            </label>

            <button id="playButton" className="bg-green-500 px-4 py-2 rounded-xl hover:bg-green-400 transition">
              Play
            </button>

            <button id="pauseButton" className="bg-red-500 px-4 py-2 rounded-xl hover:bg-red-400 transition">
              Pause
            </button>
          </div>

          <div className="relative bg-black rounded-2xl overflow-hidden border border-zinc-700">
            <video
              id="video"
              className="w-full"
              crossOrigin="anonymous"
              muted
              playsInline
            />

            <canvas
              id="overlay"
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
          </div>

          <div className="mt-4">
            <canvas
              id="scanCanvas"
              width="1024"
              height="180"
              className="w-full h-44 bg-zinc-950 rounded-2xl border border-zinc-700"
            />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-4 shadow-2xl border border-zinc-800 overflow-y-auto max-h-[85vh]">
          <h2 className="text-2xl font-semibold mb-4">Optical Reader Modes</h2>

          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm text-zinc-400">Reading Mode</label>
              <select id="mode" className="w-full bg-zinc-800 rounded-xl p-3 border border-zinc-700">
                <option value="scanline">Horizontal Scanline</option>
                <option value="vertical">Vertical Scanline</option>
                <option value="brightness">Brightness Oscillator</option>
                <option value="rgb">RGB Triple Oscillator</option>
                <option value="edges">Edge Detector</option>
                <option value="granular">Granular Film Scrub</option>
                <option value="spectral">Spectral Frame Synth</option>
                <option value="barcode">Barcode Reader</option>
                <option value="noise">Film Grain Noise</option>
                <option value="contours">Contour Sonification</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">Scan Position</label>
              <input id="scanPos" type="range" min="0" max="1" step="0.001" defaultValue="0.5" className="w-full" />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">Frequency Range</label>
              <input id="freq" type="range" min="40" max="4000" step="1" defaultValue="440" className="w-full" />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">Sensitivity</label>
              <input id="sensitivity" type="range" min="0" max="5" step="0.01" defaultValue="1" className="w-full" />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">Playback Speed</label>
              <input id="speed" type="range" min="0.1" max="4" step="0.01" defaultValue="1" className="w-full" />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">Threshold</label>
              <input id="threshold" type="range" min="0" max="255" step="1" defaultValue="100" className="w-full" />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">Audio Volume</label>
              <input id="volume" type="range" min="0" max="1" step="0.001" defaultValue="0.5" className="w-full" />
            </div>

            <div className="border-t border-zinc-700 pt-4">
              <h3 className="text-lg font-semibold mb-2">Experimental Options</h3>

              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input id="invert" type="checkbox" />
                  Invert Brightness
                </label>

                <label className="flex items-center gap-2">
                  <input id="freeze" type="checkbox" />
                  Freeze Frame Sound
                </label>

                <label className="flex items-center gap-2">
                  <input id="feedback" type="checkbox" />
                  Audio Feedback
                </label>

                <label className="flex items-center gap-2">
                  <input id="quantize" type="checkbox" />
                  Quantize Frequencies
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 text-sm text-zinc-400 leading-relaxed">
            <p>
              This app turns moving film images into sound using optical scanning techniques inspired by:
            </p>

            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Optical film soundtracks</li>
              <li>Scan synthesis</li>
              <li>Photoelectric readers</li>
              <li>Video synthesis</li>
              <li>Experimental cinema</li>
              <li>Image sonification</li>
            </ul>
          </div>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
          console.log('Original version restored');
        `,
        }}
      />
    </div>
  );
}