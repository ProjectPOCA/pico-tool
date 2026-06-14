/**
 * Every consumer-facing string in the app.
 *
 * Panels may only ever be described by Panel ID, size class, resolution,
 * colors, and refresh time. scripts/check-ui-strings.mjs enforces this file
 * (and the rest of the renderer) against the internal-vocabulary blocklist.
 */

export const strings = {
  appName: 'pico tool',
  edition: 'Edition 1.0',

  splash: {
    stages: ['Loading drivers…', 'Loading cached profiles…', 'Preparing components…'],
    copyright:
      'Copyright ©2026 Peoples Open Codex Alliance\nLicensed under the Apache License, Version 2.0\nYou may obtain a copy of the License in the app’s Legal section.',
    artworkCredit: 'Artwork by\nAspen Pevan'
  },

  agreement: {
    titleTop: 'Let’s Get',
    titleAccent: '>Started',
    intro:
      'The Pico Tool is an open source tool for loading the POCA Pico OS and creating Python programs for Raspberry Pi Pico, using recycled price tag (e-ink) displays.',
    agreePrompt: 'To use Pico Tool, you agree to the provided Terms of Use.',
    checkboxPrefix: 'I have agreed to the Terms of Use and acknowledge the ',
    privacyLink: 'Privacy Statement',
    acknowledgeHeader: 'A few things to acknowledge:',
    terms: [
      {
        heading: 'Educational use',
        body: 'Pico Tool exists for education, repair, and community projects. It teaches hardware reuse by giving retired price tag displays a second life as badges, signs, and STEAM projects.'
      },
      {
        heading: 'Your hardware, your responsibility',
        body: 'Only flash devices you own. POCA strictly discourages, and is not responsible for, use of this technology for purposes that are not educational or community-driven.'
      },
      {
        heading: 'No warranty',
        body: 'This software is provided “as is”, without warranty of any kind, under the Apache License, Version 2.0. Flashing firmware always carries a small risk to the connected device.'
      },
      {
        heading: 'Privacy',
        body: 'Pico Tool runs entirely on this computer. Saved configurations stay on this machine. The app contacts the internet only to check for updates on GitHub.'
      }
    ]
  },

  myPico: {
    title: 'My Pico',
    freshTitle: 'Starting Fresh?',
    freshBody:
      'The Pico Tool is an open source tool for loading the POCA Pico OS and creating Python programs for Raspberry Pi Pico, using recycled price tag (e-ink) displays.',
    savedHeader: 'Saved Configs',
    emptyHint: 'Configurations you save after a flash will appear here.',
    flashAgain: 'Flash',
    delete: 'Delete'
  },

  select: {
    title: 'Select',
    subtitle: 'a Display Driver',
    selectedTitle: 'Selected',
    display: 'Display:',
    colors: 'Colors:',
    refresh: 'Refresh Speed:',
    refreshUnit: 'seconds',
    testDisplay: 'Test Display',
    testSending: 'Sending test pattern…',
    testDone: 'Pattern sent — watch the display.',
    comingSoon: 'Coming soon',
    colorNames: {
      black: 'Black',
      white: 'White',
      red: 'Red',
      yellow: 'Yellow'
    } as Record<string, string>
  },

  flashMode: {
    title: 'Flash\nMode',
    pocaOs: 'POCA OS',
    badge: 'Badge',
    activity: 'MicroPython Activity',
    raster: 'Raster Image',
    descriptions: {
      'poca-os':
        'POCA OS for Pico\nIncludes mini versions of POCA’s 8 apps.\n\nNOTE: On color displays, refresh is slow (25+ seconds). On B/W displays, refresh is fast (4–5 seconds).',
      badge:
        'Badge\nFlash a simple square image with text to the Pico controller, using the editor.',
      activity:
        'MicroPython Activity\nLoad a .py script onto the Pico — educational programming projects for STEAM students using the Python language.',
      raster:
        'Raster Image\nFlash a single JPEG or PNG file onto the Pico, formatted to use all the available colors on the display.'
    } as Record<string, string>
  },

  badge: {
    title: 'Badge\nEditor',
    namePlaceholder: 'Badge text',
    background: 'Background',
    textColor: 'Text'
  },

  filePick: {
    activityTitle: 'Pick a\nScript',
    rasterTitle: 'Pick an\nImage',
    activityHint: 'Choose a MicroPython (.py) file to run on the Pico at boot.',
    rasterHint: 'Choose a JPEG or PNG. It will be fitted to the display and converted to its colors.',
    choose: 'Choose File…',
    dither: 'Dither',
    fitCover: 'Fill',
    fitContain: 'Fit'
  },

  progress: {
    title: 'Flash\nMode',
    body: 'We’re getting your Pico ready for your new project. Please do not unplug the device or close the program. This step will take a few minutes.',
    cancel: 'Cancel',
    retry: 'Retry'
  },

  done: {
    title: 'All Done',
    body1: 'Your Pico device is now ready to use.',
    body2:
      'If you’d like to try again, press the restart button below to retry or flash a new Pico device. You can also save the current configuration for future uses.',
    saveTooltip: 'Save to My Pico',
    copyTooltip: 'Repeat this flash on another Pico',
    restartTooltip: 'Start over',
    savedName: (panelId: string) => `Pico ${panelId}`
  },

  devices: {
    pickerTitle: 'Which Pico?',
    pickerBody: 'More than one Pico is connected. Choose the one to flash.',
    nonePresent: 'No Pico found. Connect one over USB and try again.',
    bootselHint: 'Fresh Pico? Hold BOOTSEL while plugging it in — pico tool will set it up.'
  },

  updates: {
    available: (v: string) => `Version ${v} is available.`,
    download: 'Get it on GitHub'
  },

  window: {
    minimize: 'Minimize',
    close: 'Close'
  }
}
