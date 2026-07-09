# Additional clean files
cmake_minimum_required(VERSION 3.16)

if("${CONFIG}" STREQUAL "" OR "${CONFIG}" STREQUAL "Debug")
  file(REMOVE_RECURSE
  "Ai-Vod-Review_autogen"
  "CMakeFiles\\Ai-Vod-Review_autogen.dir\\AutogenUsed.txt"
  "CMakeFiles\\Ai-Vod-Review_autogen.dir\\ParseCache.txt"
  )
endif()
