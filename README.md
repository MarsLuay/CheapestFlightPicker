# Cheapest Flight Picker

This is a flight search app that compares every single flight within the specifications you give it, and simply feeds you the cheapest options.

It's built around Google Flights data, runs locally on your machine, and gives you both a browser UI and a CLI if you'd want one.

The root of this repo is intentionally pretty clean to let even your grandma run this tool, and the meat of the project lives in `workspace/app`.

## What this thing does

- Searches flexible departure and return windows
- Lets you filter by:
  - departure and arrival time
  - cabin
  - stops
  - airlines
  - direct-booking preference when Google exposes the seller
- Shows these result buckets:
  - Cheapest overall
  - Cheapest round-trip
  - Cheapest two one-ways
  - Cheapest direct there
  - Cheapest option with stops
- Gives you Google Flights links for the results it finds
- Has a hidden admin panel you can open with `` ` `` or `~` if you want logs

## Easiest way to run it
### Windows

```bat
setup-and-launch.bat
```

### Linux

```bash
chmod +x setup-and-launch.sh
./setup-and-launch.sh
```

### macOS

```bash
chmod +x setup-and-launch.sh
./setup-and-launch.sh
```

## Background

I wanted to visit my girlfriend across the country as a broke college student, and google flights wasn't cutting it for me.

After hours of researching other repos and methods people have released to find the 'cheapest' flight, the good resources were all paygated.

I was not happy.
Out of spite, I made this tool.

## License
This repo is source-available under `PolyForm Noncommercial 1.0.0`.

That means:

- you can read the code
- you can learn from it
- you can use it for personal, hobby, research, and other noncommercial stuff

What you cannot do under this license:

- use it commercially
- sell it
- use it in a paid product, paid service, client project, or business workflow without permission

If you want to use this commercially, you need a separate commercial license from the author (me)

Feel free to contact me here at
`https://github.com/MarsLuay` or at [marwanluay2005@gmail.com](mailto:marwanluay2005@gmail.com)

See [LICENSE](LICENSE) for the actual license text.
