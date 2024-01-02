# Smart-Irrigation-System
This is a school project, a smart irrigation system to water the plants.

The Smart Irrigation System uses a combined technology of a Raspberry Pi Pico W, various sensors, and motors to create a smart plant watering system. You can control it easily through a web interface, allowing automatic or manual plant watering. The web interface is user-friendly, giving you the power to set watering schedules or adjust them manually.


This manual walks you through using the TeleFarm Frontend interface, making plant care simple and accessible.

USER MANUAL

This manual walks you through using the TeleFarm Frontend interface, making plant care simple and accessible.

The UI consists of three pages. The main landing page features a manual pump button used to signal the device to water your plant. The water amount depends on the selected profile, each with its specified volume in ml. The chosen profile, for example 'Chilli,' is highlighted in bold. You can switch profiles by hovering 'Profiles' on the top bar and selecting from the dropdown menu that appears.

The UI includes a dedicated page to create, edit, and delete profiles. Here, you can name a profile, set its mode, target moisture, watering schedule, and the amount of water. You have the freedom to adjust these values as needed. In the current program version, leaving certain values blank won't cause issues, except for automatic watering without a specified timing, which will not function. Users need to input values that align with their desired outcome for effective operation

The statistics page features a user-friendly chart displaying real-time data. Users can access historical data by setting timestamps on the left side of the page and clicking the 'get data' button. Additionally, users have the option to deactivate live data using the 'Live' toggle switch. The chart's displayed values can be tailored by toggling specific options found on the left side of Figure 4, providing users with a customizable viewing experience.

The UI incorporates an error notification system designed to alert users about any system anomalies. Presently, the system flags two primary types of errors: sensor malfunctions, depicted in red and water level errors, indicating insufficient water levels hindering the system's optimal functionality.These error notifications serve as visual cues to prompt users about specific issues, such as sensor irregularities or low water levels, ensuring timely user intervention for system troubleshooting and maintenance.