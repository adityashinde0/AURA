cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(aura_orbit VERSION 1.0.0 LANGUAGES C)

target_sources(app PRIVATE
    src/main.c
    src/ble_orbit_service.c
    src/privacy_gate.c
    src/haptic_driver.c
)

target_include_directories(app PRIVATE
    src
)

zephyr_library_include_directories(
    ${ZEPHYR_BASE}/include
    ${ZEPHYR_BASE}/include/zephyr
)
