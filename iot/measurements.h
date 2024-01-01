//
// Created by jpj1 on 3.12.2023.
//

#ifndef PICO_MQTT_MEASUREMENTS_H
#define PICO_MQTT_MEASUREMENTS_H

#define ADC_0               0
#define ADC_1               1
#define ADC_0_PIN           26
#define ADC_1_PIN           27
#define SPI_SS_PIN          17
#define SPI                 spi0
#define SPI_MOSI_PIN        19 // Not used
#define SPI_MISO_PIN        16
#define SPI_CLK_PIN         18

void initialize_sensors();
int measure_moisture();
int measure_light();
int measure_water_level();

#endif //PICO_MQTT_MEASUREMENTS_H
