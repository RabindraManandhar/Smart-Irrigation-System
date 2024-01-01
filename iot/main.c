//
// Created by jpj1 on 6.11.2023.
//

#include <stdio.h>
#include <string.h>
#include "pico/stdlib.h"
#include "pico/cyw43_arch.h"
#include "cyw43.h"
#include <ctype.h>
#include "hardware/spi.h"
#include <lwip/apps/mqtt_priv.h>
#include "mqtt.h"
#include "ip4_addr.h"
#include "measurements.h"
#include "pico/util/queue.h"


#define STATUS_TOPIC            "status"
#define SETTINGS_TOPIC          "set"
#define MODE_AUTO               1
#define MODE_MANUAL             0

#define PUMP_GPIO               15



#define PORT                    1883
#define MIN_WATER_LEVEL         5

#define ERROR_PRESSURE_SENSOR   (1UL << 0)
#define ERROR_WATER_LEVEL       (1UL << 1)

char ssid[] = "SmartIotMQTT";
char pass[] = "SmartIot";
int git adbroker_ip[] = {192, 168, 1, 106};

static queue_t system_state_q;

typedef struct {
    int mode;
    int humidity;
    int water;
} system_state;

int64_t turn_off_pump(alarm_id_t id, void *user_data) {
    (void) user_data;
    gpio_put(PUMP_GPIO, false);
    printf("\nPumping finishe\n");
    return 0;
}

// mosquitto_pub -t set -m '{"mode":0,"moisture":45,"water":100}'


void pump_water(int ml){
    if(ml <= 0){
        return;
    }
    // Pump can pump 100 ml in four seconds, so each ml takes 40 ms
    int delay = ml * 80;
    gpio_put(PUMP_GPIO, true);
    // Call alarm_callback after delay
    add_alarm_in_ms(delay, turn_off_pump, NULL, false);
}

void data_callback(void * p, const u8_t *data, u16_t len, u8_t flags) {
    (void) p;
    printf("\nGot new MQTT data\n");
    printf("len: %lu, n1: %u, %s\n", len, flags, data);
    int mode = 0;
    int moisture = 0;
    int water = 0;

    int result = sscanf((char *)data, "{\"mode\":%d,\"moisture\":%d,\"water\":%d}", &mode, &moisture, &water);
    if(result == 3){
        printf("read: %d\n", result);
        printf("a: %d\nb: %d\nc: %d\n", mode, moisture, water);
        system_state new_state;
        // Validate input to valid ranges
        if(moisture < 0){
            moisture = 0;
        }
        else if(moisture > 100){
            moisture = 100;
        }
        if(water > 750){
            water = 750;
        }
        else if(water < 0){
            water = 0;
        }
        if(mode != MODE_MANUAL && mode != MODE_AUTO){
            mode = MODE_MANUAL;
        }
        new_state.humidity = moisture;
        new_state.water = water;
        new_state.mode = mode;
        queue_try_add(&system_state_q, &new_state);
    }
    else {
        printf("Invalid data\r\n");
    }
}

static void mqtt_request_cb(void *arg, err_t err) {
    static int i = 0;
    if(arg != NULL){
        const struct mqtt_connect_client_info_t *client_info = (const struct mqtt_connect_client_info_t*)arg;
        printf("%d: MQTT client \"%s\" request cb: err %d\n", i++, client_info->client_id, (int)err);
    }
}

static void mqtt_connection_cb(mqtt_client_t *client, void *arg, mqtt_connection_status_t status) {
    (void)arg;
    //const struct mqtt_connect_client_info_t *client_info = (const struct mqtt_connect_client_info_t*)arg;
    LWIP_UNUSED_ARG(client);
    err_t err;

    if (status != MQTT_CONNECT_ACCEPTED) {
        printf("MQTT connection FAILED. Status %d\n", (int)status);
    }
    /* subscribe to topics */
    if (status == MQTT_CONNECT_ACCEPTED) {
        printf("MQTT connect accepted\n");
        err = mqtt_subscribe(client, SETTINGS_TOPIC, 0, mqtt_request_cb, NULL );
        if (err!=ERR_OK) {
            printf("failed subscribing, err %d\n", err);
        }
    } else if (status==MQTT_CONNECT_DISCONNECTED) {
        printf("MQTT connect disconnect\n");
    }
}


int main(){

    stdio_init_all();
    printf("Boot\r\n");

    initialize_sensors();

    gpio_init(PUMP_GPIO);
    gpio_set_dir(PUMP_GPIO, GPIO_OUT);
    gpio_set_pulls(PUMP_GPIO, false, true);
    gpio_set_drive_strength(PUMP_GPIO, GPIO_DRIVE_STRENGTH_12MA);
    gpio_put(PUMP_GPIO, false);

    queue_init(&system_state_q, sizeof(system_state), 30);

    system_state state;
    state.humidity = 0;
    state.mode = 0;
    state.water = 0;


    if (cyw43_arch_init_with_country(CYW43_COUNTRY_FINLAND)) {
        printf("Failed to initialise cyw43\n");
        while(1);
    }

    cyw43_arch_enable_sta_mode();

    if (cyw43_arch_wifi_connect_timeout_ms(ssid, pass, CYW43_AUTH_WPA2_AES_PSK, 10000)) {
        printf("Failed to connect to WIFI\n");
        while(1);
    }
    printf("Connected to WIFI\n");

    ip_addr_t broker_addr;
    IP4_ADDR(&broker_addr, broker_ip[0], broker_ip[1], broker_ip[2], broker_ip[3]);

    mqtt_client_t *mqtt_client = mqtt_client_new();
    struct mqtt_connect_client_info_t mqtt_client_info = {
            .client_id = "pico_test",
            .client_user = NULL,
            .client_pass = NULL,
            .keep_alive = 100,  /* keep alive timeout in seconds */
            .will_topic = NULL,
            .will_msg = NULL,
            .will_qos = 0,
            .will_retain = 0
    };

    mqtt_set_inpub_callback(mqtt_client, NULL, data_callback, LWIP_CONST_CAST(void*, &mqtt_client_info));

    /* connect to broker */
    cyw43_arch_lwip_begin();                            /* start section for to lwIP access */
    mqtt_client_connect(
            mqtt_client,                                /* client handle */
            &broker_addr,                               /* broker IP address */
            PORT,                                       /* port to be used */
            mqtt_connection_cb,
            LWIP_CONST_CAST(void*, &mqtt_client_info),  /* connection callback with argument */
            &mqtt_client_info                           /* client information */
    );
    cyw43_arch_lwip_end();                              /* end section accessing lwIP */

    const int buffer_size = 100;
    char buffer[buffer_size];

    uint32_t error = 0;

    int moisture = 0;
    int light = 0;
    int water_level = 100;
    absolute_time_t t = make_timeout_time_ms(60000);
    absolute_time_t publish_time = make_timeout_time_ms(10000);

    int count = 0;
    while (true) {

        count++;
        printf("%d\n", count);

        moisture = measure_moisture();
        light = measure_light();
        water_level = measure_water_level();

        if(water_level < 0){ // Negative value means that the pressure could not be read
            error |= ERROR_PRESSURE_SENSOR;
        }
        else {
            error &= ~ERROR_PRESSURE_SENSOR;
        }

        // Get new values for system from queue if available
        if(queue_try_remove(&system_state_q, &state)){
            if(state.mode == MODE_MANUAL){
                if(water_level >= MIN_WATER_LEVEL){
                    pump_water(state.water);
                    error &= ~ERROR_WATER_LEVEL;
                }
                else {
                    error |= ERROR_WATER_LEVEL;
                }
                // Publish system's status shortly after manual command so user can quickly see if there is an active error
                publish_time = make_timeout_time_ms(1000);
            }
            else if(state.mode == MODE_AUTO) {
                // Pump water after one minute once state changed to auto
                t = make_timeout_time_ms(60000);
            }
            else {  // Invalid state, set state to manual
                state.mode = MODE_MANUAL;
            }
        }
        else if(state.mode == MODE_AUTO){
            if(moisture < state.humidity){
                if(time_reached(t)){
                    if(water_level >= MIN_WATER_LEVEL){
                        printf("In auto mode and too dry, pumping water...\r\n");
                        pump_water(state.water);
                        error &= ~ERROR_WATER_LEVEL;
                    }
                    else {
                        error |= ERROR_WATER_LEVEL;
                    }
                    // Pump more water after one minutes if it's still too dry
                    t = make_timeout_time_ms(60000);
                }
            }
        }

#if 1
        if(time_reached(publish_time)){
            publish_time = make_timeout_time_ms(10000);

            snprintf(buffer, buffer_size, "{\"water\":%d,\"light\":%d,\"moisture\":%d,\"errors\":%lu,\"mode\":%d}", water_level, light, moisture, error, state.mode);
            printf("Starting to publish...\n");

            cyw43_arch_lwip_begin();
            err_t err = mqtt_publish(mqtt_client, STATUS_TOPIC, buffer, strlen(buffer), 0, 0, mqtt_request_cb, (void*) &mqtt_client_info);
            if(err == ERR_CONN) {
                printf("Connection lost, reconnecting...\n");
                mqtt_client_connect(
                        mqtt_client,                                // client handle
                        &broker_addr,                               // broker IP address
                        PORT,                                       // port to be used
                        mqtt_connection_cb,
                        LWIP_CONST_CAST(void*, &mqtt_client_info),  // connection callback with argument
                        &mqtt_client_info                           // client information
                );
            }
            else {
                printf("Published...\n");
            }
            cyw43_arch_lwip_end(); // end section accessing lwIP
        }
#endif
        sleep_ms(1000);
    }
}
